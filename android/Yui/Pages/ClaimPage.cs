using Yui.Core;
using Yui.Services;

namespace Yui.Pages;

/// <summary>Move a home of the old login to this entry: prove the old login once (Google, or e-mail and password).</summary>
public sealed class ClaimPage : ContentPage
{
	public ClaimPage()
	{
		var email = new Entry { Placeholder = "メールアドレス", Keyboard = Keyboard.Email };
		var password = new Entry { Placeholder = "パスワード", IsPassword = true };
		var google = new Button { Text = "Googleで確かめる" };
		google.Clicked += async (_, _) => await Claim(async () => await Account.Current.Api.ClaimGoogleAsync(await GoogleToken.GetAsync(Ui.Activity)));
		var mail = new Button { Text = "メールとパスワードで確かめる" };
		mail.Clicked += async (_, _) => await Claim(() => Account.Current.Api.ClaimPasswordAsync(email.Text?.Trim() ?? "", password.Text ?? ""));
		var close = new Button { Text = "閉じる" };
		close.Clicked += async (_, _) => await Navigation.PopModalAsync();
		Content = new ScrollView
		{
			Content = new VerticalStackLayout
			{
				Spacing = 10, Padding = 16,
				Children =
				{
					Ui.Title("前の結のデータを引き継ぐ"),
					Ui.Note("以前、GoogleかAppleかメールで結にログインしていた方は、そのログインを一度だけ確かめて、家のデータをこのアカウントに移せます。移したあと、前のログインは結のサーバーから消えます。Appleでログインしていた方は、iPhoneやMacの結から引き継げます。"),
					google, email, password, mail, close,
				},
			},
		};
	}

	private async Task Claim(Func<Task> call) => await Ui.RunAsync(this, async () =>
	{
		try { await call(); }
		catch (YuiApiException e) when (e.Status == 404) { await DisplayAlertAsync("引き継ぎ", "引き継ぎの受け付けは終わりました。", "OK"); return; }
		catch (Kitepon.LoginBilling.LoginBillingException e) when (e.Code == "cancelled") { return; }
		await DisplayAlertAsync("引き継ぎました", "前の家のデータが、このアカウントに移りました。", "OK");
		await Navigation.PopModalAsync();
	});
}
