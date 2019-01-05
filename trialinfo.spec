%undefine __brp_ldconfig
%undefine __brp_mangle_shebangs
%undefine __brp_strip_static_archive

Summary: Web application for managing observed trials competitions
Name: trialinfo
Version: %{VERSION}
Release: 0%{?dist}
BuildArch: noarch
Requires: nodejs mariadb-server python2-poppler-qt4 poppler-utils
Source0: %{name}-%{version}.tar.gz
Source1: snapshot.tar.gz

License: AGPLv3+
URL: https://github.com/trialinfo/trialinfo

%description
A web application for managing observed trials motorbike and bicycle
competitions. The code is mainly in English; the documentation and user
interface are in German.

%prep
%autosetup -p1
tar -xzf "%{SOURCE1}"

%build
ls
make build
rm -fv backend/views/*.marko backend/emails/*.marko

( cd backend/dist
find . -type f -print0 \
| xargs -0 -i'{}' cp -v --parents '{}' .. )
rm -rf backend/dist

%check

%install
find -depth \( -name debian -o -name Makefile -o -name create-db.sql \) -prune -o -print \
| cpio -pd %{buildroot}/var/lib/%{name}
install -d %{buildroot}/var/lib/${package}/pdf/regform
# install -D create-db.sql %{buildroot}/usr/share/doc/${package}/create-db.sql
install -d %{buildroot}/etc/systemd/system
install -m 644 systemd/%{name}.service systemd/%{name}.socket \
	%{buildroot}/etc/systemd/system/

%post
useradd --system trialinfo || [ $? -eq 9 ]
systemctl stop trialinfo.service 2> /dev/null || :
systemctl daemon-reload
systemctl restart trialinfo.socket 2> /dev/null || :

%files
/etc/systemd/system/%{name}.service
/etc/systemd/system/%{name}.socket
%doc create-db.sql
/var/lib/%{name}/

%changelog
* Sat Jan 5 2019 Andreas Gruenbacher <andreas.gruenbacher@gmail.com> - %{version}-%{release}
- Initial package.
