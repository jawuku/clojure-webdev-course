#!/usr/bin/env bash
# Build a Fedora RPM from the app image.
#
# Like the .deb path, this repacks the app image instead of using
# `jpackage --type rpm`, so the runtime keeps the bin/java fix. The spec is
# generated here because the app image path and package names vary by build.
set -euo pipefail
cd "$(dirname "$0")/.."

PKG_NAME="${PKG_NAME:-parens}"
APP_VERSION="${APP_VERSION:-0.1.0}"
APP_IMAGE_NAME="${APP_IMAGE_NAME:-ParensPhase0}"
RPM_RELEASE="${RPM_RELEASE:-1}"
RPM_MAINTAINER="${RPM_MAINTAINER:-Parens maintainers <noreply@example.com>}"

source scripts/require_jdk.sh

if ! command -v rpmbuild >/dev/null 2>&1; then
  echo "rpmbuild is required (Fedora: sudo dnf install -y rpm-build)." >&2
  exit 1
fi

bash scripts/build_appimage.sh

APP_IMAGE="$(pwd)/target/jpackage/$APP_IMAGE_NAME"
TOP="$(pwd)/target/rpm"
SPEC="$TOP/SPECS/$PKG_NAME.spec"

rm -rf "$TOP"
mkdir -p "$TOP"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}

cat > "$TOP/SOURCES/parens-wrapper" <<EOF
#!/bin/sh
exec /opt/$PKG_NAME/bin/$APP_IMAGE_NAME "\$@"
EOF
chmod 0755 "$TOP/SOURCES/parens-wrapper"

install -m 0644 packaging/parens.desktop "$TOP/SOURCES/parens.desktop"
install -m 0644 packaging/parens.svg "$TOP/SOURCES/parens.svg"
install -m 0644 ../LICENSE "$TOP/SOURCES/LICENSE"

cat > "$SPEC" <<EOF
# Keep the bundled runtime byte-identical: no strip/debug post-processing.
%global debug_package %{nil}
%global __os_install_post %{nil}
# The app image carries its own runtime; automatic ELF dependency generation
# would require its private libjli.so. Declare the system libraries instead.
AutoReqProv: no

Name:           $PKG_NAME
Version:        $APP_VERSION
Release:        $RPM_RELEASE%{?dist}
Summary:        Learn Clojure with a local JVM
License:        MIT
URL:            https://github.com/jawuku/clojure-webdev-course
Requires:       glibc
Requires:       zlib
Recommends:     libX11
Recommends:     libXext
Recommends:     libXrender
Recommends:     libXi
Recommends:     libXtst
Recommends:     xdg-utils

%description
Parens serves its course UI on loopback and evaluates code in a separate,
killable JVM. This Phase 0 slice includes the Clojure course runtime.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}/opt/%{name}
cp -a %{appimage}/. %{buildroot}/opt/%{name}/
install -D -m 0755 %{_sourcedir}/parens-wrapper %{buildroot}%{_bindir}/parens
install -D -m 0644 %{_sourcedir}/parens.desktop \
  %{buildroot}%{_datadir}/applications/%{name}.desktop
install -D -m 0644 %{_sourcedir}/parens.svg \
  %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/parens.svg
install -D -m 0644 %{_sourcedir}/LICENSE \
  %{buildroot}%{_datadir}/licenses/%{name}/LICENSE

%files
%defattr(-,root,root,-)
/opt/%{name}
%{_bindir}/parens
%{_datadir}/applications/%{name}.desktop
%{_datadir}/icons/hicolor/scalable/apps/parens.svg
%{_datadir}/licenses/%{name}/LICENSE

%changelog
* Sat Oct 17 2026 $RPM_MAINTAINER - $APP_VERSION-$RPM_RELEASE
- Initial Phase 0 package.
EOF

rpmbuild --define "_topdir $TOP" --define "appimage $APP_IMAGE" -bb "$SPEC"

RPM_FILE=$(ls "$TOP"/RPMS/*/*.rpm | head -1)
echo
echo "Package:  $RPM_FILE"
echo "Size:     $(du -h "$RPM_FILE" | cut -f1)"
echo "Install:  sudo dnf install $RPM_FILE"
