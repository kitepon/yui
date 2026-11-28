using Android.Gms.Extensions;
using Xamarin.Google.MLKit.Vision.Barcode.Common;
using Xamarin.Google.MLKit.Vision.CodeScanner;
using Yui.Services;

namespace Yui.Pages;

/// <summary>This phone answers another device: scan its QR, or paste its join code.</summary>
public sealed class AdmitPage : ContentPage
{
	public AdmitPage()
	{
		var scan = new Button { Text = "QRを読み取る" };
		scan.Clicked += async (_, _) => await Ui.RunAsync(this, async () =>
		{
			var options = new GmsBarcodeScannerOptions.Builder().SetBarcodeFormats(Barcode.FormatQrCode).Build();
			string? text;
			try { text = (await GmsBarcodeScanning.GetClient(Ui.Activity, options).StartScan().AsAsync<Barcode>()).RawValue; }
			catch (OperationCanceledException) { return; }
			if (text is not null) await Joins.AnswerAsync(this, text);
		});
		var code = new Entry { Placeholder = "参加コード（リンク）を貼り付け" };
		var paste = new Button { Text = "コードで参加させる" };
		paste.Clicked += async (_, _) => await Ui.RunAsync(this, () => Joins.AnswerAsync(this, code.Text?.Trim() ?? ""));
		var close = new Button { Text = "閉じる" };
		close.Clicked += async (_, _) => await Navigation.PopModalAsync();
		Content = new ScrollView
		{
			Content = new VerticalStackLayout
			{
				Spacing = 10, Padding = 16,
				Children =
				{
					Ui.Title("他の端末を追加"),
					Ui.Note("追加したい端末（別のスマホ、iPad、Mac、ブラウザ）の結に出るQRを読み取ります。ブラウザの結は、ここで許可した端末だけが使えます。"),
					scan, code, paste, close,
				},
			},
		};
	}

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
