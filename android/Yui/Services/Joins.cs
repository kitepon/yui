using Kitepon.LoginBilling;

namespace Yui.Services;

/// <summary>Join codes and links: the phone that already has a key answers them, the wanting phone takes the return link. The visible page sets Handler; a link that arrives earlier waits in Pending.</summary>
public static class Joins
{
	private static Func<string, Task>? handler;
	private static string? pending;

	public static Func<string, Task>? Handler
	{
		get => handler;
		set
		{
			handler = value;
			if (value is not null && pending is { } text) { pending = null; _ = value(text); }
		}
	}

	/// <summary>A tapped link (App Link intent).</summary>
	public static void Arrived(string text)
	{
		if (handler is { } h) _ = MainThread.InvokeOnMainThreadAsync(() => h(text));
		else pending = text;
	}

	public static bool IsReturnLink(string text) => text.Contains("#lbr1:", StringComparison.Ordinal);
	public static bool IsAnswerable(string text) => LocalForm.IsLibraryQR(text) || text.Contains("#lbc1:", StringComparison.Ordinal);

	/// <summary>This phone answers a QR or a join code: the person confirms, then the library sends the answer.</summary>
	public static async Task AnswerAsync(Page page, string text)
	{
		if (!IsAnswerable(text)) { await page.DisplayAlertAsync("結のコードではありません", "結の参加用のQRやコードを読み取ってください。", "OK"); return; }
		var answered = await Account.Current.Local.AnswerAsync(Ui.Activity, text, async (string? role) =>
			await MainThread.InvokeOnMainThreadAsync(() => page.DisplayAlertAsync(
				role == "parent" ? "親の役目を渡す" : "端末を参加させる",
				role == "parent" ? "この端末の親の役目を、相手の端末に渡します。" : "この端末のホームに、相手の端末を参加させます。心当たりのある端末だけ許可してください。",
				"許可する", "やめる")));
		switch (answered.Answered)
		{
			case LocalAnswered.Taken: await page.DisplayAlertAsync("完了", "相手の端末が受け取りました。", "OK"); break;
			case LocalAnswered.NoPurchase: await page.DisplayAlertAsync("応答を送りました", "この端末に購読はないと伝えました。", "OK"); break;
			case LocalAnswered.ReturnLink:
				await Clipboard.SetTextAsync(answered.ReturnLink);
				await page.DisplayAlertAsync("相手の端末に届きませんでした", (LocalWords.Ja(answered.Cause ?? "") ?? "") + "\n返信のリンクをコピーしました。参加したい端末で、そのリンクを開いてください。", "OK");
				break;
		}
	}
}
