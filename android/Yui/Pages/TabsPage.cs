namespace Yui.Pages;

public sealed class TabsPage : TabbedPage
{
	public TabsPage()
	{
		Children.Add(new HomePage { Title = "ホーム" });
		Children.Add(new SettingsPage { Title = "設定" });
	}
}
