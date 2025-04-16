# Export your Must movies
Export your Must watched movies (and ratings, and reviews, and so on) on a CSV you can then import elsewhere.

At the moment the only officially supported export format is for __[Letterboxd](https://letterboxd.com/import/)__, to import into other platforms you might have to modify the file ([look at some suggestions](#what-do-i-do-with-the-file-downloaded)).
Assuming you are importing on Letterboxd the movies will also be added to your diary, if you choose to do so in the Letterboxd importer. 

### ✅ Now working (tested on 16-04-2025)
_(there might be issues if there are too many concurrent users)_

## Installation
Zero installations, just go to the [website](https://dj-frixz.github.io/export-mustapp-data/)!

## Usage
[Click here](https://dj-frixz.github.io/export-mustapp-data/) to enter the site, insert your [Must username](#where-do-i-find-my-must-username) (without the _@_!) and click _Export_. Wait for it to complete the process and the CSV with all your movies and ratings should be automatically downloaded to your device!

### Where do I find my Must username?
To get your Must username:
- **on mobile**: go to profile and touch your profile photo to get to the settings, then copy the "Nickname" (not the "Name"!), or _share via link_ and then copy the username without the "@";
- **on PC**: simply login to <https://mustapp.com> and copy your username in the address bar without the "@" (ex. _johnwick_ in mustapp.com/@johnwick)

The site doesn't warn you if the user hasn't been found, therefore in the case it doesn't work try to double check the username.

### What do I do with the file downloaded?
If you want to import your watched movies on Letterboxd, go [here](https://letterboxd.com/import/) and upload there your downloaded file.

At the moment importing into other platforms is not officially supported, hence uploading the file on other importers might not work. In the case it doesn't get accepted you may want to modify the CSV or extract the IMDB IDs, as those IDs can be used to import movies on almost every platform.

If you want to import your watched movies and reviews on IMDb I suggest using Tampermonkey and the [IMDb importer script](https://greasyfork.org/en/scripts/23584-imdb-list-importer) (I don't own any of this, so please refer to them for any help).

## Feature requests
Write feature requests in the [issues](https://github.com/Dj-Frixz/export-mustapp-data/issues) of this repository, any feedback is appreciated!
