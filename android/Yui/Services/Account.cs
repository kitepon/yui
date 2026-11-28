using Android.Content;
using Kitepon.LoginBilling;
using Yui.Core;

namespace Yui.Services;

public enum SessionState { SignedOut, NoEntry, Ready }

/// <summary>This device's sign-in, key and the signed client of Yui: the library's LocalForm and Keyholes under one storage name, so they share one device key.</summary>
public sealed class Account : IRequestSigner
{
	public const string Origin = "https://yuihome.kitepon.dev";
	public const string AppId = "dev.kitepon.yuihome";
	public const string ProductId = "dev.kitepon.yuihome.hosted";
	/// <summary>The yui-hosted Google Web client: the library's audience and the serverClientId of the claim token.</summary>
	public const string WebClientId = "916284233737-d1526ubmm33ba181rsk68vk91jk3248c.apps.googleusercontent.com";

	public static Account Current { get; } = new(Android.App.Application.Context);

	private readonly Keyholes keyholes;
	public LocalForm Local { get; }
	public YuiApi Api { get; }

	private Account(Context context)
	{
		keyholes = new Keyholes(context, Origin + "/api/", AppId);
		// Play stays null: this phone checks its own store only (Mint, 0.28.0).
		Local = new LocalForm(context, WebClientId, new LocalConfig([WebClientId], AppId: AppId), keyholes: new LocalKeyholes(AppId));
		Api = new YuiApi(new HttpClient(), this, new Uri(Origin));
	}

	public string? Header(string method, string url, byte[]? body) => keyholes.Header(method, url, body);
	public void UseServerTime(long nowMs) => keyholes.UseServerTime(nowMs);

	public async Task<SessionState> StateAsync()
	{
		if (Local.KeptSignIn() is null || keyholes.PublicKey() is null) return SessionState.SignedOut;
		return await Api.MeAsync() is null ? SessionState.NoEntry : SessionState.Ready;
	}

	public Task SignInAsync(Android.App.Activity activity) => Local.SignInLocalAsync(activity, "google");

	/// <summary>"Start here" on the first device: a new entry with this device as its parent.</summary>
	public Task<KeyholeEntry> StartHereAsync() => keyholes.StartAsync();

	/// <summary>Sign out: the key leaves its entry (the last device leaving deletes the home at once), then the sign-in is dropped.</summary>
	public async Task SignOutAsync()
	{
		await keyholes.LeaveAsync();
		Local.SignOutLocal();
	}

	/// <summary>The contract's order: 1 the data, 2 every other key (a parent only), 3 leave, 4 key and sign-in.</summary>
	public async Task DeleteAccountAsync()
	{
		var me = await Api.MeAsync();
		await Api.DeleteAccountDataAsync();
		if (me?.Role == "parent") await keyholes.SignOutOthersAsync();
		await keyholes.LeaveAsync();
		keyholes.DeleteKey();
		Local.SignOutLocal();
	}
}
