using Yui.Services;

namespace Yui.Pages;

/// <summary>Signed in, but this key is in no entry: start a new one, or join through another phone (later).</summary>
public sealed class StartPage : ContentPage
{
	public StartPage()
	{
		var start = new Button { Text = "この端末で新しく始める" };
		start.Clicked += async (_, _) => await Ui.RunAsync(this, async () =>
		{
			await Account.Current.StartHereAsync();
			Ui.Restart();
		});
		Content = new VerticalStackLayout
		{
			VerticalOptions = LayoutOptions.Center, Spacing = 16, Padding = 24,
			Children =
			{
				Ui.Title("はじめる"),
				Ui.Note("前に使っていた端末が手元にあれば、その端末から参加できます。手元に無い場合は、新しく始めます。前の家の中身は、結のサーバーが180日後に消します。結は、それ以外の取り戻し方を用意していません。"),
				start,
			},
		};
	}
}
