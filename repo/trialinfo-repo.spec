Summary: TrialInfo package repository
Name: trialinfo-repo
Version: 1
Release: 0%{?dist}
BuildArch: noarch
Source0: trialinfo.repo
Source1: RPM-GPG-KEY-trialinfo

License: AGPLv3+
URL: https://github.com/trialinfo/trialinfo

%description
TrialInfo package repository files for yum and dnf along with gpg public keys

%install
install -d %{buildroot}/etc/yum.repos.d %{buildroot}/etc/pki/rpm-gpg/
install -m 644 %{SOURCE0} %{buildroot}/etc/yum.repos.d/
install -m 644 %{SOURCE1} %{buildroot}/etc/pki/rpm-gpg/

%files
/etc/pki/rpm-gpg/*
/etc/yum.repos.d/*

%changelog
* Sat Jan 5 2019 Andreas Gruenbacher <andreas.gruenbacher@gmail.com> - %{version}-%{release}
- Initial package.
