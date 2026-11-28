using Android.Content;
using AndroidX.Work;
using Yui.Services;

namespace Yui;

/// <summary>The daily restatement of the paid date (contract: Android WorkManager). A failure is kept in PaidDate.LastError and tried again the next day.</summary>
public class PaidDateWorker(Context context, WorkerParameters parameters) : Worker(context, parameters)
{
	public override Result DoWork()
	{
		PaidDate.ReportAsync().GetAwaiter().GetResult();
		return Result.InvokeSuccess()!;
	}
}
