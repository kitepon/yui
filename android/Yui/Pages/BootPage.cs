using Yui.Services;

namespace Yui.Pages;

/// <summary>Decides the first screen from the device's state; a failed check shows the reason and a retry, never a guess.</summary>
public sealed class BootPage : ContentPage
{
	private readonly Label message = new() { HorizontalTextAlignment = TextAlignment.Center };
	private readonly Button retry = new() { Text = "もう一度", IsVisible = false };

	public BootPage()
	{
		retry.Clicked += async (_, _) => await CheckAsync();
		Content = new VerticalStackLayout { VerticalOptions = LayoutOptions.Center, Spacing = 16, Padding = 24, Children = { new ActivityIndicator { IsRunning = true }, message, retry } };
	}

	protected override async void OnAppearing()
	{
		base.OnAppearing();
		await CheckAsync();
	}

	private async Task CheckAsync()
	{
		message.Text = "確認しています…";
		retry.IsVisible = false;
		try
		{
			Page next = await Account.Current.StateAsync() switch
			{
				SessionState.SignedOut => new SignInPage(),
				SessionState.NoEntry => new StartPage(),
				_ => new TabsPage(),
			};
			_ = PaidDate.ReportAsync();
			Application.Current!.Windows[0].Page = next;
		}
		catch (Exception e) when (e is Core.YuiApiException or Kitepon.LoginBilling.LoginBillingException or HttpRequestException)
		{
			message.Text = Ui.Describe(e);
			retry.IsVisible = true;
		}
	}
}
