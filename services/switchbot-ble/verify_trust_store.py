"""Fail the BLE image build if its normal Python TLS trust store is stale."""

from __future__ import annotations

import json
import importlib.util
import ssl
import subprocess

MINIMUM_CA_VERSION = "20250419~deb12u2"
REMOVED_ROOTS = {"emSign ECC Root CA - G3", "AAA Certificate Services"}
RETAINED_ROOT = "emSign Root CA - G1"


def main() -> None:
    version = subprocess.check_output(
        ["dpkg-query", "-W", "-f=${Version}", "ca-certificates"], text=True
    ).strip()
    subprocess.run(
        ["dpkg", "--compare-versions", version, "ge", MINIMUM_CA_VERSION], check=True
    )
    context = ssl.create_default_context()
    if context.verify_mode != ssl.CERT_REQUIRED or not context.check_hostname:
        raise RuntimeError("Python TLS certificate/hostname verification is disabled")
    certificates = context.get_ca_certs()
    common_names = {
        value
        for certificate in certificates
        for rdn in certificate["subject"]
        for key, value in rdn
        if key == "commonName"
    }
    if common_names & REMOVED_ROOTS:
        raise RuntimeError("Distrusted root remains in Python's default trust store")
    if RETAINED_ROOT not in common_names:
        raise RuntimeError("Required retained root is missing")
    if importlib.util.find_spec("pip") is not None:
        raise RuntimeError("Build-only pip and its separate CA bundle remain in the runtime")
    if importlib.util.find_spec("certifi") is not None:
        raise RuntimeError("Unexpected separate certifi trust store in the BLE runtime")
    print(json.dumps({"ca_version": version, "certificates": len(certificates),
                      "distrusted_roots_present": False, "retained_g1_present": True,
                      "certificate_verification": True, "hostname_verification": True,
                      "build_only_pip_present": False, "separate_certifi_present": False}))


if __name__ == "__main__":
    main()
