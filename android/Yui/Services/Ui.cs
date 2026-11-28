using Kitepon.LoginBilling;
using Yui.Core;
using Yui.Pages;

namespace Yui.Services;

public static class Ui
{
	public static string Describe(Exception e) => e switch
	{
		YuiApiException y => y.Message,
		LoginBillingException l => (LocalWords.Ja(l.Code) ?? "処理できませんでした") + "（" + l.Code + "）",
		HttpRequestException => "結のサーバーに接続できません。通信を確かめてください",
		_ => e.Message,
	};

	/// <summary>Runs a screen action. 401 means the key or the entry is gone: back to the start. Any other known failure is shown as it is.</summary>
	public static async Task RunAsync(Page page, Func<Task> work)
	{
		try { await work(); }
		catch (YuiApiException e) when (e.Status == 401) { Restart(); }
		catch (Exception e) when (e is YuiApiException or LoginBillingException or HttpRequestException)
		{
			await page.DisplayAlertAsync("できませんでした", Describe(e), "OK");
		}
	}

	public static void Restart() => MainThread.BeginInvokeOnMainThread(() => Application.Current!.Windows[0].Page = new BootPage());

	public static Android.App.Activity Activity => Platform.CurrentActivity ?? throw new InvalidOperationException("no activity");

	public static Label Title(string text) => new() { Text = text, FontSize = 22, FontAttributes = FontAttributes.Bold, Margin = new Thickness(0, 12, 0, 4) };
	public static Label Note(string text) => new() { Text = text, FontSize = 13, TextColor = Colors.Gray };
}
