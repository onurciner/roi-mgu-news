# Haber Özeti for BMW iDrive 7

An unofficial iDrive 7 app with a BMW home-screen `startWidget` that shows Turkish news headlines and short feed descriptions. Tapping the widget opens the app; the app screen lets you move through the latest stories and refresh them.

## News source

The app reads Google's public Turkish News RSS feed (`news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr`). It is free and does not need an API key. The feed provides publisher headlines, links, dates and descriptions where available. The app keeps the latest successful response in its app data folder and shows that cache when the car has no internet connection. Refresh defaults to every 30 minutes and can be changed in the app's settings.

This is an RSS feed, so some publishers may not supply a full article summary. In those cases the widget shows the headline and publisher, while the app screen shows the feed description when present.

## Add it through MGU Store

1. Publish this repository to your GitHub account.
2. In the car's MGU Store, choose **Settings → Add source**, enter `onurciner/roi-mgu-news`, and follow the `main` branch.
3. Install **Haber Özeti**. The Store builds the app on the head unit using the BMW SDK donor already present there.
4. Open the iDrive home-screen widget chooser and add **Haber Özeti**. The widget is supplied in the app package; the Store install alone does not place it on the home screen.

The head unit needs the MGU Store internet uplink online for fresh headlines. Without a connection, the widget continues to use its last saved feed. This repository includes the MIT-licensed iDrive 7 app runtime and build files from [cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps); see [KIT-LICENSE-MIT.txt](KIT-LICENSE-MIT.txt) and [KIT-NOTICE.md](KIT-NOTICE.md).

## Repository layout

- `mgu-repo.json`: source catalog and on-car build configuration.
- `apps/roi_news/app.json`: ID7 app metadata and its real home-screen widget declaration.
- `apps/roi_news/main.js`: feed retrieval, cache, app screen and widget rendering.
- `kit/`: the MGU App Kit runtime and the small subset of its build tools this repo needs.

Local package builds need an `oap-sdk` extracted from a BMW donor app. MGU Store provides the donor on the head unit during a source build, so no BMW SDK files are committed here.
