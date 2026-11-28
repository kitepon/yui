using Yui.Services;

namespace Yui.Pages;

public sealed class TabsPage : TabbedPage
{
	public TabsPage()
	{
		Children.Add(new HomePage { Title = "ホーム" });
		Children.Add(new SettingsPage { Title = "設定" });
	}

	// A join link tapped while the app is open (or before it opened) is answered here.
	protected override void OnAppearing()
	{
		base.OnAppearing();
		Joins.Handler = text => Ui.RunAsync(this, () => Joins.AnswerAsync(this, text));
	}

	protected override void OnDisappearing()
	{
		base.OnDisappearing();
		Joins.Handler = null;
	}
}
