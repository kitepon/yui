using System.Text.Json.Serialization;

namespace Yui.Core;

// Shapes of /api/home as the iPhone app reads them (ios/Yui/Models.swift); only what v1 screens use.

public sealed record Device(
    string Id, string Name, string Room, string Kind, string Source, bool Online, string? Brand = null, string? Connector = null,
    bool? On = null, double? Brightness = null, double? Temperature = null, double? Humidity = null, double? OutdoorTemp = null,
    double? TargetTemp = null, string? Mode = null, double? Position = null, string? Extra = null, string? BotMode = null)
{
    public bool IsMomentary => Kind == "bot" && BotMode != "switch";
    public bool CanQuickAct => Online && Kind is "light" or "plug" or "bot" or "curtain" or "ac" or "lock";

    /// <summary>The patch of a single tap, as the iPhone app sends it (SessionStore.quickAct).</summary>
    public object QuickPatch() => IsMomentary ? new { on = true }
        : Kind == "curtain" ? ((Position ?? 0) == 0 ? new { position = 100, on = true } : new { position = 0, on = false })
        : new { on = !(On ?? false) };

    public string Status
    {
        get
        {
            if (!Online) return "接続できません";
            switch (Kind)
            {
                case "ac":
                    var modes = new Dictionary<string, string> { ["cool"] = "冷房", ["heat"] = "暖房", ["dry"] = "除湿", ["fan"] = "送風", ["auto"] = "自動", ["humidify"] = "加湿" };
                    var parts = new List<string> { On == false ? "停止" : modes.GetValueOrDefault(Mode ?? "", "運転中") };
                    if (On != false && TargetTemp is { } t) parts.Add($"{(int)t}°");
                    if (Temperature is { } r) parts.Add($"室温{r:0.0}°");
                    return string.Join(" · ", parts);
                case "light": return On != true ? "消灯" : Brightness is { } b ? $"点灯 · {(int)b}%" : "点灯";
                case "curtain": return $"開き {(int)(Position ?? 0)}%";
                case "sensor":
                    var v = new[] { Temperature is { } x ? $"{x:0.0}°" : null, Humidity is { } h ? $"{(int)h}%" : null }.Where(s => s is not null);
                    return v.Any() ? string.Join(" · ", v) : "計測中";
                case "bot": return IsMomentary ? "押して操作" : On == true ? "オン" : "オフ";
                case "lock": return On == true ? "施錠" : "解錠";
                default: return On == true ? "オン" : "オフ";
            }
        }
    }
}

public sealed record HomeScene(string Id, string Name, string? Hint = null);

public sealed record HomeAutomation(string Id, string Name, bool Enabled);

public sealed record ConnectorStatus(string Id, bool Connected, int? DeviceCount = null, string? Error = null);

public sealed record CredentialFlags(bool? NatureToken, bool? SwitchbotToken, bool? SwitchbotSecret, bool? TuyaAccessId, bool? TuyaSecret, bool? TuyaUid);

public sealed record HomeSnapshot(
    List<Device> Devices, List<HomeScene> Scenes, List<HomeAutomation>? Automations = null, List<string>? Rooms = null,
    Dictionary<string, List<string>>? DeviceOrder = null, Dictionary<string, ConnectorStatus>? Connectors = null,
    CredentialFlags? CredentialFlags = null, string? TuyaRegion = null, string? Error = null)
{
    /// <summary>Live devices when there are any, else every device (a home with only demo data still shows).</summary>
    public IReadOnlyList<Device> LiveDevices => Devices.Where(d => d.Source == "live").ToList() is { Count: > 0 } live ? live : Devices;

    public IEnumerable<Device> InRoom(string room)
    {
        var order = DeviceOrder?.GetValueOrDefault(room) ?? [];
        return LiveDevices.Where(d => d.Room == room).OrderBy(d => order.IndexOf(d.Id) is var i and >= 0 ? i : int.MaxValue);
    }
}

public sealed record LinkCode(string Code, int ExpiresInSeconds);

/// <summary>The entry this device's key is in and its role ("parent" or "child"), from keys/me.</summary>
public sealed record Me(string Entry, string Role);
