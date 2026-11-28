using QRCoder;
using Yui.Services;

namespace Yui.Pages;

/// <summary>This phone wants to join an entry (or take over as its parent): it shows a QR and a code; the phone that already has a key answers, and the add it returns puts this key in the entry.</summary>
public sealed class JoinPage : ContentPage
{
	private readonly bool handOver;
	private Kitepon.LoginBilling.LocalRequest? request;
	private readonly Image qr = new() { HeightRequest = 280, WidthRequest = 280, HorizontalOptions = LayoutOptions.Center };
	private readonly Label code = new() { FontSize = 11, LineBreakMode = LineBreakMode.CharacterWrap };
	private readonly Label status = new() { Text = "準備しています…" };

	public JoinPage(bool handOver)
	{
		this.handOver = handOver;
		var copy = new Button { Text = "参加コードをコピー" };
		copy.Clicked += async (_, _) => { if (code.Text is { Length: > 0 } t) await Clipboard.SetTextAsync(t); };
		var close = new Button { Text = "戻る" };
		close.Clicked += (_, _) => Ui.Restart();
		Content = new ScrollView
		{
			Content = new VerticalStackLayout
			{
				Spacing = 10, Padding = 16,
				Children =
				{
					Ui.Title(handOver ? "別の端末から引き継ぐ" : "別の端末から参加する"),
					Ui.Note(handOver
						? "前の端末の結で「他の端末を追加」を開き、ここのQRを読み取ってください。親の役目がこの端末に移ります。前の端末と同じWi-Fiにつないでおいてください。"
						: "前の端末の結で「他の端末を追加」を開き、ここのQRを読み取ってください。前の端末と同じWi-Fiにつないでおいてください。"),
					qr, status, code, copy, close,
				},
			},
		};
	}

	protected override async void OnAppearing()
	{
		base.OnAppearing();
		Joins.Handler = async link => await Ui.RunAsync(this, async () =>
		{
			if (!Joins.IsReturnLink(link)) return;
			await Finish(await Account.Current.Local.TakeAsync(link));
		});
		await Ui.RunAsync(this, async () =>
		{
			request = await Account.Current.Local.MakeRequestAsync(Ui.Activity, "google", handOver);
			var png = new PngByteQRCode(new QRCodeGenerator().CreateQrCode(request.Qr, QRCodeGenerator.ECCLevel.M)).GetGraphic(8);
			qr.Source = ImageSource.FromStream(() => new MemoryStream(png));
			code.Text = request.Code;
			status.Text = "相手の端末が読み取るのを待っています。";
			await Finish(await request.AwaitOutcomeAsync());
		});
	}

	protected override void OnDisappearing()
	{
		base.OnDisappearing();
		Joins.Handler = null;
		request?.Dispose();
	}

	private async Task Finish(Kitepon.LoginBilling.LocalOutcome outcome)
	{
		if (outcome.Add is not { } add) { status.Text = "参加できませんでした。もう一度やり直してください。"; return; }
		await Account.Current.SendAddAsync(add);
		Ui.Restart();
	}
}
