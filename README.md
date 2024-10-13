# Linkclump-ng

[![Codacy Badge](https://api.codacy.com/project/badge/Grade/9e38a24d7f524c6ca73c07e8948d58a7)](https://www.codacy.com/manual/benblack86/linkclump?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=benblack86/linkclump&amp;utm_campaign=Badge_Grade)

After manifest v3, Linkclump is no longer available in the Chrome Web Store. This is a fork of the original Linkclump extension that has been updated to manifest v3.

Thanks to [benblack86](https://github.com/benblack86) for creating and maintaining this amazing extension.

## Installation

Install it by visiting the [chrome web store](https://chrome.google.com/webstore/detail/linkclump/lfpjkncokllnfokkgpkobnkbkmelfefj).

## Build

The build process uses ant (run `ant` at the command line) and will run tests and create a zip file that can be uploaded to the chrome store. From docker:

```bash
docker run --mount type=bind,source="$(pwd)",target=/app frekele/ant:1.10.3-jdk8u111 ant -f /app/build.xml
```
