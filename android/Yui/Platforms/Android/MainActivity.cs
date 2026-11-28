using Android.App;
using Android.Content.PM;
using Android.OS;

namespace Yui;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, LaunchMode = LaunchMode.SingleTop, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
	protected override void OnCreate(Bundle? savedInstanceState)
	{
		// The library asks for local-network access where Android requires it (the QR exchange); it must be registered before the activity starts.
		Services.Account.Current.Local.RegisterLocalNetwork(this);
		base.OnCreate(savedInstanceState);
	}
}
