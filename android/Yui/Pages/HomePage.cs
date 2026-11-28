using Yui.Core;
using Yui.Services;
using Device = Yui.Core.Device; // MAUI also has a Device

namespace Yui.Pages;

/// <summary>Rooms, devices (one tap each), scenes and automation switches of the signed-in home. v1 reads and operates; it edits nothing.</summary>
public sealed class HomePage : ContentPage
{
	private readonly VerticalStackLayout body = new() { Spacing = 8, Padding = 16 };
	private readonly RefreshView refresh;

	public HomePage()
	{
		refresh = new RefreshView { Content = new ScrollView { Content = body } };
		refresh.Refreshing += async (_, _) =>
		{
			await Load(() => Account.Current.Api.HomeAsync());
			refresh.IsRefreshing = false;
		};
		Content = refresh;
	}

	protected override async void OnAppearing()
	{
		base.OnAppearing();
		await Load(() => Account.Current.Api.HomeAsync());
	}

	private Task Load(Func<Task<HomeSnapshot>> call) => Ui.RunAsync(this, async () => Render(await call()));

	private void Render(HomeSnapshot home)
	{
		body.Children.Clear();
		if (home.Error is { Length: > 0 } error) body.Children.Add(new Label { Text = error, TextColor = Colors.OrangeRed });
		var rooms = home.Rooms is { Count: > 0 } ? home.Rooms : home.LiveDevices.Select(d => d.Room).Distinct().ToList();
		if (home.LiveDevices.Count == 0) body.Children.Add(Ui.Note("機器がまだありません。設定でサービスの認証情報を保存し、同期してください。"));
		foreach (var room in rooms)
		{
			var devices = home.InRoom(room).ToList();
			if (devices.Count == 0) continue;
			body.Children.Add(Ui.Title(room));
			foreach (var device in devices) body.Children.Add(Row(device));
		}
		if (home.Scenes.Count > 0)
		{
			body.Children.Add(Ui.Title("場面"));
			var flex = new FlexLayout { Wrap = Microsoft.Maui.Layouts.FlexWrap.Wrap };
			foreach (var scene in home.Scenes)
			{
				var b = new Button { Text = scene.Name, Margin = new Thickness(0, 0, 8, 8) };
				b.Clicked += (_, _) => _ = Load(() => Account.Current.Api.PlaySceneAsync(scene.Id));
				flex.Children.Add(b);
			}
			body.Children.Add(flex);
		}
		if (home.Automations is { Count: > 0 })
		{
			body.Children.Add(Ui.Title("オートメーション"));
			foreach (var automation in home.Automations)
			{
				var toggle = new Switch { IsToggled = automation.Enabled };
				toggle.Toggled += (_, e) => _ = Load(() => Account.Current.Api.ToggleAutomationAsync(automation.Id, e.Value));
				var row = new Grid { ColumnDefinitions = [new(GridLength.Star), new(GridLength.Auto)] };
				row.Add(new Label { Text = automation.Name, VerticalOptions = LayoutOptions.Center });
				row.Add(toggle, 1);
				body.Children.Add(row);
			}
		}
	}

	private View Row(Device device)
	{
		var row = new Grid { ColumnDefinitions = [new(GridLength.Star), new(GridLength.Auto)], Padding = new Thickness(0, 4) };
		row.Add(new VerticalStackLayout { Children = { new Label { Text = device.Name, FontSize = 16 }, Ui.Note(device.Status) } });
		if (device.CanQuickAct)
		{
			var b = new Button { Text = device.IsMomentary ? "押す" : device.Kind == "curtain" ? ((device.Position ?? 0) == 0 ? "開ける" : "閉める") : (device.On == true ? "切る" : "入れる") };
			b.Clicked += (_, _) => _ = Load(() => Account.Current.Api.ControlAsync(device.Id, device.QuickPatch()));
			row.Add(b, 1);
		}
		return row;
	}
}
