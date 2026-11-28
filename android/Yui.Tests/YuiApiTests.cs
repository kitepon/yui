using System.Net;
using System.Text;
using Xunit;
using Yui.Core;

public class YuiApiTests
{
    private sealed class Signer : IRequestSigner
    {
        public long? ServerNow; public int Calls; public string? Key = "k1";
        public string? Header(string method, string url, byte[]? body) { Calls++; return Key is null ? null : $"v1 {method} {url} {body?.Length ?? 0} {ServerNow}"; }
        public void UseServerTime(long nowMs) => ServerNow = nowMs;
    }

    private sealed class Handler(params (HttpStatusCode, string)[] answers) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Seen = [];
        public List<string> Bodies = [];
        private int i;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Seen.Add(request);
            Bodies.Add(request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct));
            var (code, text) = answers[Math.Min(i++, answers.Length - 1)];
            return new HttpResponseMessage(code) { Content = new StringContent(text, Encoding.UTF8, "application/json") };
        }
    }

    private static YuiApi Api(Handler h, Signer s) => new(new HttpClient(h), s, new Uri("https://yuihome.kitepon.dev"));

    private const string Home = """{"devices":[{"id":"d1","name":"灯","room":"居間","kind":"light","source":"live","online":true,"on":true,"brightness":60},{"id":"d2","name":"デモ","room":"居間","kind":"plug","source":"demo","online":true}],"scenes":[{"id":"s1","name":"おやすみ"}],"rooms":["居間"],"deviceOrder":{"居間":["d1"]}}""";

    [Fact]
    public async Task HomeSendsTheSignatureAndReadsTheSnapshot()
    {
        var h = new Handler((HttpStatusCode.OK, Home)); var s = new Signer();
        var home = await Api(h, s).HomeAsync();
        Assert.Equal("v1 GET https://yuihome.kitepon.dev/api/home 0 ", h.Seen[0].Headers.GetValues("Login-Billing-Key").Single());
        Assert.Equal("d1", home.LiveDevices.Single().Id); // demo devices are hidden when live ones exist
        Assert.Equal("点灯 · 60%", home.InRoom("居間").Single().Status);
        Assert.Equal("おやすみ", home.Scenes.Single().Name);
    }

    [Fact]
    public async Task SignedBytesAreTheSentBytes()
    {
        var h = new Handler((HttpStatusCode.OK, Home)); var s = new Signer();
        await Api(h, s).PlaySceneAsync("s1");
        Assert.Equal("""{"op":"scene","sceneId":"s1"}""", h.Bodies[0]);
        Assert.Contains($" {Encoding.UTF8.GetByteCount(h.Bodies[0])} ", h.Seen[0].Headers.GetValues("Login-Billing-Key").Single());
    }

    [Fact]
    public async Task TimeOffIsRetriedOnceWithTheServersClock()
    {
        var h = new Handler((HttpStatusCode.Unauthorized, """{"error":"time_off","now":1795000000000}"""), (HttpStatusCode.OK, Home)); var s = new Signer();
        await Api(h, s).HomeAsync();
        Assert.Equal(1795000000000, s.ServerNow);
        Assert.Equal(2, h.Seen.Count);
    }

    [Fact]
    public async Task TimeOffTwiceIsAnError()
    {
        var h = new Handler((HttpStatusCode.Unauthorized, """{"error":"time_off","now":1}""")); var s = new Signer();
        var e = await Assert.ThrowsAsync<YuiApiException>(() => Api(h, s).HomeAsync());
        Assert.Equal(401, e.Status);
        Assert.Equal(2, h.Seen.Count);
    }

    [Fact]
    public async Task NoKeyMeansNoRequest()
    {
        var h = new Handler((HttpStatusCode.OK, Home));
        var e = await Assert.ThrowsAsync<YuiApiException>(() => Api(h, new Signer { Key = null }).HomeAsync());
        Assert.Equal(401, e.Status);
        Assert.Empty(h.Seen);
    }

    [Theory]
    [InlineData(403, """{"error":"not your entry"}""", "not your entry")]
    [InlineData(409, """{"message":"already claimed"}""", "already claimed")]
    [InlineData(500, "oops", "サーバーエラー 500")]
    public async Task ServerWordsComeThrough(int status, string body, string expected)
    {
        var h = new Handler(((HttpStatusCode)status, body));
        var e = await Assert.ThrowsAsync<YuiApiException>(() => Api(h, new Signer()).StatePaidUntilAsync(1));
        Assert.Equal(status, e.Status);
        Assert.Equal(expected, e.Message);
    }

    [Fact]
    public async Task MeIsNullForAKeyInNoEntry()
    {
        var h = new Handler((HttpStatusCode.Unauthorized, """{"error":"not_signed_in"}"""), (HttpStatusCode.OK, """{"entry":"e1","role":"parent"}"""));
        var api = Api(h, new Signer());
        Assert.Null(await api.MeAsync());
        Assert.Equal(new Me("e1", "parent"), await api.MeAsync());
        Assert.Equal("{}", h.Bodies[0]);
    }

    [Fact]
    public void QuickTapPatchesMatchTheIPhoneApp()
    {
        Device D(string kind, bool? on = null, double? pos = null, string? bot = null) => new("d", "n", "r", kind, "live", true, On: on, Position: pos, BotMode: bot);
        Assert.Equal("{ on = True }", D("bot").QuickPatch().ToString());
        Assert.Equal("{ on = False }", D("light", on: true).QuickPatch().ToString());
        Assert.Equal("{ on = True }", D("plug").QuickPatch().ToString());
        Assert.Equal("{ position = 100, on = True }", D("curtain", pos: 0).QuickPatch().ToString());
        Assert.Equal("{ position = 0, on = False }", D("curtain", pos: 40).QuickPatch().ToString());
    }

    [Fact]
    public async Task DeleteWithNoHomeIsNotAFailure()
    {
        var h = new Handler((HttpStatusCode.NotFound, """{"deleted":false}"""));
        await Api(h, new Signer()).DeleteAccountDataAsync();
        Assert.Equal(HttpMethod.Delete, h.Seen[0].Method);
    }

    [Fact]
    public async Task PaidDateAndClaimBodiesMatchTheServerRoutes()
    {
        var h = new Handler((HttpStatusCode.OK, """{"paidUntil":5}"""), (HttpStatusCode.OK, """{"ok":true}"""), (HttpStatusCode.OK, """{"ok":true}"""));
        var api = Api(h, new Signer());
        await api.StatePaidUntilAsync(1795000000000);
        await api.ClaimGoogleAsync("tok", "n1");
        await api.ClaimPasswordAsync("a@b", "pw");
        Assert.Equal(["""{"paidUntil":1795000000000}""", """{"method":"google","idToken":"tok","nonce":"n1"}""", """{"method":"password","email":"a@b","password":"pw"}"""], h.Bodies);
    }
}
