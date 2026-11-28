using System.Net;
using System.Text.Json;

namespace Yui.Core;

/// <summary>A refused or failed call to Yui. Status 401 means signed out (or no device key); the message is the server's own words when it gave one.</summary>
public sealed class YuiApiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
}

/// <summary>The only place that sends a request to Yui: signs it, maps the answer. One time_off retry, never a second.</summary>
public sealed class YuiApi(HttpClient http, IRequestSigner signer, Uri origin)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public Task<HomeSnapshot> HomeAsync() => Send<HomeSnapshot>(HttpMethod.Get, "/api/home");
    public Task<HomeSnapshot> ControlAsync(string deviceId, object patch) => Send<HomeSnapshot>(HttpMethod.Post, "/api/home", new { op = "control", deviceId, patch });
    public Task<HomeSnapshot> PlaySceneAsync(string sceneId) => Send<HomeSnapshot>(HttpMethod.Post, "/api/home", new { op = "scene", sceneId });
    public Task<HomeSnapshot> SyncAsync(string brand) => Send<HomeSnapshot>(HttpMethod.Post, "/api/home", new { op = "sync", brand });
    public Task<HomeSnapshot> SaveCredentialsAsync(Dictionary<string, string> fields) => Send<HomeSnapshot>(HttpMethod.Post, "/api/home", new { op = "credentials", credentials = fields });
    public Task<HomeSnapshot> ToggleAutomationAsync(string automationId, bool enabled) => Send<HomeSnapshot>(HttpMethod.Post, "/api/home", new { op = "automation-toggle", automationId, enabled });

    /// <summary>States the paid date in epoch milliseconds; the server keeps the later of the stored and the stated.</summary>
    public async Task StatePaidUntilAsync(long paidUntilMs) => await Send<JsonElement>(HttpMethod.Post, "/api/home/paid-until", new { paidUntil = paidUntilMs });

    /// <summary>The nonce is the one the Credential Manager request carried, so the server can match it to the token.</summary>
    public async Task ClaimGoogleAsync(string idToken, string nonce) => await Send<JsonElement>(HttpMethod.Post, "/api/claim", new { method = "google", idToken, nonce });
    public async Task ClaimPasswordAsync(string email, string password) => await Send<JsonElement>(HttpMethod.Post, "/api/claim", new { method = "password", email, password });

    /// <summary>keys/me: the entry of this device's key, or null when the key is in no entry (or no key is kept).</summary>
    public async Task<Me?> MeAsync()
    {
        try { return await Send<Me>(HttpMethod.Post, "/api/keys/me", new { }); }
        catch (YuiApiException e) when (e.Status == 401) { return null; }
    }

    public Task<LinkCode> MakeLinkCodeAsync() => Send<LinkCode>(HttpMethod.Post, "/api/alexa/link-code");

    /// <summary>The home as JSON text, without vendor secrets.</summary>
    public async Task<string> ExportAsync() => (await Send<JsonElement>(HttpMethod.Get, "/api/account-data")).GetRawText();

    /// <summary>Step 1 of account deletion. No home (404) is not a failure: there is nothing left to delete.</summary>
    public async Task DeleteAccountDataAsync()
    {
        try { await Send<JsonElement>(HttpMethod.Delete, "/api/account-data"); }
        catch (YuiApiException e) when (e.Status == 404) { }
    }

    private async Task<T> Send<T>(HttpMethod method, string path, object? body = null)
    {
        var bytes = body is null ? null : JsonSerializer.SerializeToUtf8Bytes(body, Json);
        var url = new Uri(origin, path);
        for (var attempt = 0; ; attempt++)
        {
            var header = signer.Header(method.Method, url.ToString(), bytes) ?? throw new YuiApiException(401, "この端末にはログインの鍵がありません");
            using var request = new HttpRequestMessage(method, url);
            request.Headers.TryAddWithoutValidation("Login-Billing-Key", header);
            request.Headers.TryAddWithoutValidation("Accept", "application/json");
            if (bytes is not null)
            {
                request.Content = new ByteArrayContent(bytes);
                request.Content.Headers.ContentType = new("application/json");
            }
            using var response = await http.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            if (response.StatusCode == HttpStatusCode.Unauthorized && attempt == 0 && TimeOffNow(text) is { } now)
            {
                signer.UseServerTime(now);
                continue;
            }
            if (!response.IsSuccessStatusCode) throw new YuiApiException((int)response.StatusCode, ErrorText(text, (int)response.StatusCode));
            return JsonSerializer.Deserialize<T>(text, Json)!;
        }
    }

    private static long? TimeOffNow(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            var root = doc.RootElement;
            return root.TryGetProperty("error", out var e) && e.GetString() == "time_off" && root.TryGetProperty("now", out var n) ? n.GetInt64() : null;
        }
        catch (JsonException) { return null; }
    }

    private static string ErrorText(string text, int status)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            foreach (var key in new[] { "error", "message" })
                if (doc.RootElement.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String) return v.GetString()!;
        }
        catch (JsonException) { }
        return $"サーバーエラー {status}";
    }
}
