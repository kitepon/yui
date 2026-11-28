using Android.App;
using Android.Runtime;
using AndroidX.Core.Content;
using AndroidX.Credentials;
using Google.Android.Libraries.Identity.GoogleId;
using Kitepon.LoginBilling;

namespace Yui.Services;

/// <summary>A second Google ID token for the claim only (the library's own sign-in token never leaves the library): audience = the yui-hosted Web client, own nonce. It goes to POST /api/claim with its nonce and nowhere else.</summary>
public static class GoogleToken
{
	public static Task<(string IdToken, string Nonce)> GetAsync(Activity activity)
	{
		var done = new TaskCompletionSource<(string, string)>(TaskCreationOptions.RunContinuationsAsynchronously);
		var nonce = Guid.NewGuid().ToString("N");
		var option = new GetGoogleIdOption.Builder()
			.SetServerClientId(Account.WebClientId)
			.SetFilterByAuthorizedAccounts(false)
			.SetNonce(nonce)
			.Build();
		var request = new GetCredentialRequest.Builder().AddCredentialOption(option).Build();
		CredentialManager.Companion.Create(activity).GetCredentialAsync(activity, request, null, ContextCompat.GetMainExecutor(activity)!, new Callback(done, nonce));
		return done.Task;
	}

	private sealed class Callback(TaskCompletionSource<(string, string)> done, string nonce) : Java.Lang.Object, ICredentialManagerCallback
	{
		public void OnResult(Java.Lang.Object? result)
		{
			if ((result as GetCredentialResponse)?.Credential is CustomCredential c && c.Type == GoogleIdTokenCredential.TypeGoogleIdTokenCredential)
				done.TrySetResult((GoogleIdTokenCredential.CreateFrom(c.Data).IdToken, nonce));
			else done.TrySetException(new LoginBillingException("google_token_missing", 0));
		}

		public void OnError(Java.Lang.Object? error)
		{
			var e = error?.JavaCast<Java.Lang.Throwable>();
			done.TrySetException(new LoginBillingException(e?.Class?.SimpleName == "GetCredentialCancellationException" ? "cancelled" : "google_sign_in_failed", 0, detail: e?.Message));
		}
	}
}
