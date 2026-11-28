namespace Yui.Core;

/// <summary>What YuiApi needs from the library's Keyholes: the signature header of a request and the server's clock after a time_off answer.</summary>
public interface IRequestSigner
{
    /// <summary>The Login-Billing-Key value for this request, or null while no device key is kept.</summary>
    string? Header(string method, string url, byte[]? body);
    void UseServerTime(long nowMs);
}
