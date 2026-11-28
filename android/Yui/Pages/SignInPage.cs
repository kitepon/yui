using Yui.Services;

namespace Yui.Pages;

public sealed class SignInPage : ContentPage
{
	public SignInPage()
	{
		var button = new Button { Text = "Googleでログイン" };
		button.Clicked += async (_, _) => await Ui.RunAsync(this, async () =>
		{
			await Account.Current.SignInAsync(Ui.Activity);
			Ui.Restart();
		});
		Content = new VerticalStackLayout
		{
			VerticalOptions = LayoutOptions.Center, Spacing = 16, Padding = 24,
			Children =
			{
				new Label { Text = "結", FontSize = 40, HorizontalTextAlignment = TextAlignment.Center },
				Ui.Note("結のサーバーはGoogleのアカウントもメールアドレスも持ちません。ログインはこの端末の中で完結します。"),
				button,
			},
		};
	}
}
