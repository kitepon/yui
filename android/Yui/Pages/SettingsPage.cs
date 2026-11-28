using System.Text.Json;
using Kitepon.LoginBilling;
using Yui.Core;
using Yui.Services;

namespace Yui.Pages;

/// <summary>Vendor keys and sync, the subscription, the Alexa link code, export, sign-out and deletion.</summary>
public sealed class SettingsPage : ContentPage
{
	private static readonly (string Key, string Label)[] Fields =
	[
		("natureToken", "Nature Remo アクセストークン"), ("switchbotToken", "SwitchBot トークン"), ("switchbotSecret", "SwitchBot シークレット"),
		("tuyaAccessId", "Smart Life Access ID"), ("tuyaSecret", "Smart Life Secret"), ("tuyaUid", "Smart Life UID"),
	];
	private static readonly (string Id, string Label)[] Regions = [("auto", "自動"), ("us", "America"), ("eu", "Europe"), ("jp", "Japan"), ("we", "Western Europe"), ("in", "India"), ("cn", "China")];

	private readonly Dictionary<string, Entry> entries = [];
	private readonly Picker region = new() { Title = "Smart Life のデータセンター", ItemsSource = Regions.Select(r => r.Label).ToList(), SelectedIndex = 0 };
	private readonly VerticalStackLayout subscription = new() { Spacing = 8 };
	private readonly Label subscriptionStatus = new();
	private readonly Label codeLabel = new() { FontSize = 28, FontAttributes = FontAttributes.Bold };
	private readonly VerticalStackLayout body = new() { Spacing = 10, Padding = 16 };

	public SettingsPage()
	{
		body.Children.Add(Ui.Title("家電とつなぐ"));
		body.Children.Add(Ui.Note("認証情報は結のサーバーに暗号化して保存されます。この端末には残りません。"));
		foreach (var (key, label) in Fields)
		{
			entries[key] = new Entry { Placeholder = label, IsPassword = true };
			body.Children.Add(entries[key]);
		}
		body.Children.Add(region);
		body.Children.Add(Button("認証情報を保存", Save));
		foreach (var (id, label) in new[] { ("nature", "Nature Remo"), ("switchbot", "SwitchBot"), ("smartlife", "Smart Life") })
			body.Children.Add(Button(label + " を同期", () => Ui.RunAsync(this, async () => await Account.Current.Api.SyncAsync(id))));

		body.Children.Add(Ui.Title("購読"));
		body.Children.Add(subscriptionStatus);
		body.Children.Add(subscription);

		body.Children.Add(Ui.Title("Alexa"));
		body.Children.Add(Ui.Note("Alexaのアプリでスキルを有効にし、出てきた画面にこのコードを入力します。10分だけ使えます。"));
		body.Children.Add(codeLabel);
		body.Children.Add(Button("リンクコードを出す", MakeCode));

		body.Children.Add(Ui.Title("データ"));
		body.Children.Add(Button("データを書き出す", Export));

		body.Children.Add(Ui.Title("アカウント"));
		body.Children.Add(Button("ログアウト", SignOut));
		var delete = Button("アカウントを削除", Delete);
		delete.TextColor = Colors.OrangeRed;
		body.Children.Add(delete);
		Content = new ScrollView { Content = body };
	}

	protected override async void OnAppearing()
	{
		base.OnAppearing();
		await LoadSubscription();
	}

	private static Button Button(string text, Func<Task> click)
	{
		var b = new Button { Text = text };
		b.Clicked += async (_, _) => await click();
		return b;
	}

	private Task Save() => Ui.RunAsync(this, async () =>
	{
		var fields = entries.Where(e => !string.IsNullOrWhiteSpace(e.Value.Text)).ToDictionary(e => e.Key, e => e.Value.Text.Trim());
		if (region.SelectedIndex > 0) fields["tuyaRegion"] = Regions[region.SelectedIndex].Id;
		if (fields.Count == 0) { await DisplayAlertAsync("保存", "入力がありません", "OK"); return; }
		await Account.Current.Api.SaveCredentialsAsync(fields);
		foreach (var e in entries.Values) e.Text = "";
		await DisplayAlertAsync("保存しました", "必要なサービスを同期してください。", "OK");
	});

	private Task LoadSubscription() => Ui.RunAsync(this, async () =>
	{
		subscription.Children.Clear();
		var own = await Account.Current.Local.OwnPurchasesAsync();
		var paid = own.Any(p => p.Products.Contains(Account.ProductId));
		subscriptionStatus.Text = (paid ? "購読中です。" : "購読していません。") + (PaidDate.LastError is { } err ? "\n支払い期日を結のサーバーに送れていません: " + err : "");
		if (paid)
		{
			subscription.Children.Add(Button("購読を管理（Google Play）", () => Launcher.OpenAsync($"https://play.google.com/store/account/subscriptions?sku={Account.ProductId}&package={Account.AppId}")));
			return;
		}
		var info = (await Account.Current.Local.ProductDetailsAsync([Account.ProductId], subscription: true)).FirstOrDefault();
		foreach (var offer in info?.Offers ?? [])
		{
			var phase = offer.Phases.Last();
			var label = (offer.BasePlanId == "annual" ? "年額 " : "月額 ") + phase.FormattedPrice;
			subscription.Children.Add(Button(label + " で購読", () => Ui.RunAsync(this, async () =>
			{
				if (await Account.Current.Local.PurchaseAsync(Ui.Activity, Account.ProductId, offer.OfferToken) is null) return; // cancelled or pending
				await PaidDate.ReportAsync();
				await LoadSubscription();
			})));
		}
		subscription.Children.Add(Button("購読を復元", async () => { await PaidDate.ReportAsync(); await LoadSubscription(); }));
	});

	private Task MakeCode() => Ui.RunAsync(this, async () => codeLabel.Text = (await Account.Current.Api.MakeLinkCodeAsync()).Code);

	private Task Export() => Ui.RunAsync(this, async () =>
	{
		var json = await Account.Current.Api.ExportAsync();
		var path = Path.Combine(FileSystem.CacheDirectory, "yui-export.json");
		await File.WriteAllTextAsync(path, json);
		await Share.Default.RequestAsync(new ShareFileRequest("結のデータ", new ShareFile(path)));
	});

	private const string LastDevice = "この端末が最後の1台なら、ログアウトすると結のサーバーから家のデータが今すぐ消えます。";

	private Task SignOut() => Ui.RunAsync(this, async () =>
	{
		if (!await DisplayAlertAsync("ログアウト", LastDevice + "\n新しい端末では、新しく始めるか、この端末から参加します。", "ログアウト", "やめる")) return;
		await Account.Current.SignOutAsync();
		Ui.Restart();
	});

	private Task Delete() => Ui.RunAsync(this, async () =>
	{
		if (!await DisplayAlertAsync("アカウントを削除", "家のデータ、Alexaとのつながり、他の端末の鍵をすべて消します。元に戻せません。購読は、Google Play で別に解約してください。", "削除する", "やめる")) return;
		await Account.Current.DeleteAccountAsync();
		Ui.Restart();
	});
}
