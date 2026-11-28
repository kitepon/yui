using Android.App;
using Android.Runtime;

namespace Yui;

[Application]
public class MainApplication : MauiApplication
{
	public MainApplication(IntPtr handle, JniHandleOwnership ownership)
		: base(handle, ownership)
	{
	}

	public override void OnCreate()
	{
		base.OnCreate();
		var request = new AndroidX.Work.PeriodicWorkRequest.Builder(Java.Lang.Class.FromType(typeof(PaidDateWorker)), 1, Java.Util.Concurrent.TimeUnit.Days!)
			.SetConstraints(new AndroidX.Work.Constraints.Builder().SetRequiredNetworkType(AndroidX.Work.NetworkType.Connected!).Build())
			.Build();
		AndroidX.Work.WorkManager.GetInstance(this).EnqueueUniquePeriodicWork("paid-date", AndroidX.Work.ExistingPeriodicWorkPolicy.Keep!, (AndroidX.Work.PeriodicWorkRequest)request);
	}

	protected override MauiApp CreateMauiApp() => MauiProgram.CreateMauiApp();
}
