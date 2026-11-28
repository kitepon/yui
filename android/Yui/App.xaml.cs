using Yui.Pages;
using Yui.Services;

namespace Yui;

public partial class App : Application
{
	public App() => InitializeComponent();

	protected override Window CreateWindow(IActivationState? activationState)
	{
		var window = new Window(new BootPage());
		// The paid date is restated at launch (BootPage) and at every return to the foreground.
		window.Resumed += (_, _) => _ = PaidDate.ReportAsync();
		return window;
	}
}
