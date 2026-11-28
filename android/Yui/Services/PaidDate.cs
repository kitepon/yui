using Yui.Core;

namespace Yui.Services;

/// <summary>Restates the paid date: Play lists the product, so the home is paid until now + the library's 31 days. Never on every request (contract).</summary>
public static class PaidDate
{
	/// <summary>The last failure, shown in settings; null after a success or when nothing was due.</summary>
	public static string? LastError { get; private set; }

	public static async Task ReportAsync()
	{
		try
		{
			var account = Account.Current;
			if (await account.StateAsync() != SessionState.Ready) return;
			var own = await account.Local.OwnPurchasesAsync();
			if (!own.Any(p => p.Products.Contains(Account.ProductId))) { LastError = null; return; }
			await account.Api.StatePaidUntilAsync(DateTimeOffset.UtcNow.AddDays(31).ToUnixTimeMilliseconds());
			LastError = null;
		}
		catch (Exception e) when (e is YuiApiException or Kitepon.LoginBilling.LoginBillingException or HttpRequestException)
		{
			LastError = Ui.Describe(e); // shown in settings; the next trigger tries again
		}
	}
}
