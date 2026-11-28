using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Yui.Services;

namespace Yui;

// The library's join link, verified through assetlinks that the login/billing site serves (Mint).
[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
[IntentFilter([Intent.ActionView], Categories = [Intent.CategoryDefault, Intent.CategoryBrowsable], DataScheme = "https", DataHost = "login-billing.kitepon.dev", DataPathPrefix = "/join/dev.kitepon.yuihome", AutoVerify = true)]
public class MainActivity : MauiAppCompatActivity
{
	protected override void OnCreate(Bundle? savedInstanceState)
	{
		// The library asks for local-network access where Android requires it (the QR exchange); it must be registered before the activity starts.
		Account.Current.Local.RegisterLocalNetwork(this);
		base.OnCreate(savedInstanceState);
		Take(Intent);
	}

	protected override void OnNewIntent(Intent? intent)
	{
		base.OnNewIntent(intent);
		Take(intent);
	}

	private static void Take(Intent? intent)
	{
		if (intent?.Action == Intent.ActionView && intent.DataString is { } link) Joins.Arrived(link);
	}
}
