# Security Policy

## Supported Versions

Use this section to tell people about which versions of your project are
currently being supported with security updates.

| Version | Supported          |
| ------- | ------------------ |
| 5.1.x   | :white_check_mark: |
| 5.0.x   | :x:                |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

Use this section to tell people how to report a vulnerability.

Tell them where to go, how often they can expect to get an update on a
reported vulnerability, what to expect if the vulnerability is accepted or
declined, etc.

## 公開入口

Cloud RunのデプロイはHTTPS LBとCloud Armor（SQLi/XSS WAF・APIのIP単位レート制限）を有効化します。ingress制限とrun.app URL無効化でインターネットからの迂回を防ぎます。設定・検査範囲・運用確認は[Cloud Armor](docs/cloud-armor.md)を参照してください。
