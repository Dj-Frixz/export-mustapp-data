const diary = document.getElementById('diary-entries');
const msg = document.getElementById('message');
const msg2 = document.getElementById('missing');
let headers = {};

function toggleGIF(gif) {
    const GIF = document.querySelector(gif);
    GIF.classList.toggle("hidden");
}

async function handleButton() {
    window.errorList = [];
    window.warnList = [];
    window.profileID = null;
    msg2.innerText = "";
    document.getElementById("btn").disabled = true;
    let username = document.getElementById('username').value;
    msg.innerText = "Fetching data for "+username+"...\n";
    let ids = await getData(username);
    if (errorList.length == 0 && warnList.length == 0) {
        msg2.classList.add("success");
        msg2.innerText = "All movies found!\n";
    } else {
        msg2.classList.remove("success");
        if (warnList.length > 0) {
            msg2.innerText = "These movies might be wrong:\n" +
                "(If you're migrating to Letterboxd just verify them during the import process.\n" +
                "Otherwise, you might want to check the CSV file.)\n\n - " +
                warnList.join("\n - ") + "\n\n";
        }
        msg2.innerText += "These movies weren't found: " +
            "\n(If you're migrating to Letterboxd don't worry the importer will try to find them by itself.\n" +
            "Otherwise, you might want to check the CSV file if you need the IMDB ids.)\n\n - " + errorList.join("\n - ");
    }
    msg.innerText += "Generating CSVs...\n";
    generateCSV(ids.want, username + "_want", "imdbID,Title,Year,Rating10,WatchedDate,Review");
    generateCSV(ids.watched, username + "_watched", "imdbID,Title,Year,Rating10,WatchedDate,Review");
    document.getElementById("btn").disabled = false;
}

function generateCSV(content, filename, _headers) {
    const csvContent = "data:text/csv;charset=utf-8," +
    _headers + " \n" +
    content.join('\n');
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename + ".csv");
    link.style.display = "block";
    link.innerText = `Click here if the download doesn't start automatically (${filename}.csv)`;
    msg.appendChild(link);
    link.click();
}

async function getData(username) {

    const mustData = await exportMustData(username);

    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiMWRiNjExNzc2OTdhMjA2MzBiMmMzMmQyMDA5ODY5YyIsIm5iZiI6MTcyOTAyMjAxOS4xODkwMywic3ViIjoiNjRjYTYxMTgwYjc0ZTkwMGFjNjZjMmE5Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.rslpnPCxpGLXcdYfTyNAuL9Qbd9Zrhy0FjSZG-HRwTw'
        }, // kindly don't steal this access token for your personal use, instead get one for free at https://www.themoviedb.org/settings/api
    };

    let IMDbIDs = {want: [], watched: []};
    n = mustData.want.length + mustData.watched.length;
    let k = 50;
    for (let list_index of Object.keys(mustData)) {
        for (let i = 0; i < mustData[list_index].length; i += k) {
            const subArray = mustData[list_index].slice(i, i + k);
            const subIMDbIDs = await convertInfoToIMDbIDs(subArray, options);
            IMDbIDs[list_index] = IMDbIDs[list_index].concat(subIMDbIDs);
            msg.innerText = "Processed " + (IMDbIDs[list_index].length) + "/" + mustData[list_index].length + ` (${list_index})\n`;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Pause for 2 second
        }
    }
    msg.innerText = "Processed " + (IMDbIDs.want.length + IMDbIDs.watched.length) + "/" + n + " (total)\n";
    msg.innerText += " ~ Failed " + errorList.length + "/" + n + 
        " ~ Unclear " + warnList.length + '\n';
    return IMDbIDs;
}

async function exportMustData(username) {
    
    const profileRes = await fetch(`https://mustapp.com/api/users/uri/${username}`);
    const profile = await profileRes.json();
    profileID = profile.id;
    const shows = profile.lists.shows; // the list of Must IDs for watched shows
    headers = {
        "accept": "*/*",
        "accept-language": "en",
        "bearer": "3a77331c-943f-44e8-b636-5deebcbe33b9",
        "content-type": "application/json;v=1873",
        "priority": "u=1, i",
        "sec-ch-ua": "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-client-version": "frontend_site/2.24.2-390.390",
        "x-requested-with": "XMLHttpRequest",
        "cookie": `G_ENABLED_IDPS=google; token=3a77331c-943f-44e8-b636-5deebcbe33b9; uid=${profile.id}`,
        "Referer": `https://mustapp.com/@${username}/watched`,
        "Referrer-Policy": "strict-origin-when-cross-origin"
    };

    return {
        want : await MustIDtoData(profile.lists.want, headers), // the list of Must IDs for films in watchlist
        watched : await MustIDtoData(profile.lists.watched, headers) // the list of watched films
    }
}

async function MustIDtoData(listIDs, headers) {

    // slice IDs in chunks of size 100 to match Must limitations
    let IDs = [listIDs.slice(0,100)];
    for (let i = 100; i < listIDs.length; i+=100) {
        IDs.push(listIDs.slice(i,i+100));
    }
    
    // get full info from must ids
    let filmList = await Promise.all(IDs.map(async ids => 
        fetch(`https://mustapp.com/api/users/id/${profileID}/products?embed=product`, {
            "headers": headers,
            "body": `{"ids":[${ids}]}`,
            "method": "POST"
        })
        .then(response => response.json())
        .then(items => getReviews(items,ids))
    ));

    return filmList.flat()
}

async function convertInfoToIMDbIDs(list, options) {
    return Promise.all(list.map(async (item) => {
        if (!item.product.release_date) {
            item.product.release_date = '';
            warnList.push(item.product.title);
        }
        let when = item.user_product_info.modified_at.substring(0,10);
        if (when && diary.value === 'reviewed') {
            when = item.product.review !== '' ? when : '';
        } else if (diary.value === 'none') {
            when = '';
        }
        let search = await searchOnTMDB(item, options);
        if (!search || search.results.length == 0) {
            errorList.push([item.product.title, item.product.release_date]);
            return `,"${item.product.title}",${item.product.release_date.substring(0,4)
            },${item.user_product_info.rate ?? ''},${when},${item.product.review}`;
        }
        let id = search.results[0]?.id || (errorList.push([item.product.title, item.product.release_date]) ? null : null);
        if (search.results.length > 1) {
            id = await guessMovie(search, item);
        }
        return getIMDBid(id, item, options, when, item.product.review);
    }));
}

/**
 * Search for a movie on TMDB using the title and year from the MustApp item.
 * @param {Object} item - The MustApp item object.
 * @param {Object} options - The options for the TMDB API request.
 * @returns {Object} The TMDB API response object.
 */
async function searchOnTMDB (item, options) {
    let title = item.product.title;
    for (let i = 0; i < 3; i++) {
        // I use year because it seems the search engine is more flexible with it and it is less prone to mismatch,
        // if it doesn't work, it could be useful retrying with primary_release_year instead of year
        let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&year=${item.product.release_date}&page=1`, options);
        let search = await res.json();
        if (typeof search !== 'undefined') {
            if (search.results.length == 0) {
                // If there are no results, we try to match the release date.
                res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(title)}&include_adult=true&page=1`, options);
                search = await res.json();
            }
            // Assuming a title with less than 4 characters has to return some results.
            if (search.results.length != 0) {
                return search;
            }
            // This is a bit dangerous as it may hide mismatches, consider to remove.
            title = title.substring(0, title.length - 1); // remove last character
        }
    }
}

/**
 * Get the IMDb ID of a movie from its TMDb ID.
 * @param {Int} id - The TMDb ID of the movie.
 * @param {Object} item - The MustApp item object.
 * @param {Object} options - The options for the TMDB API request.
 * @returns {String} A string containing the IMDb ID, title, year, rating, watched date, and review.
 */
async function getIMDBid (id, item, options, when, review) {
    while (true) {
        let res = await fetch(`https://api.themoviedb.org/3/movie/${id}/external_ids`, options);
        let film = await res.json();
        if (typeof film !== 'undefined') {
            if (film.imdb_id == null || film.imdb_id == undefined) {
                errorList.push([item.product.title, item.product.release_date]);
                film.imdb_id = '';
            }
            // IMDb ID, Title, Year, Rating10, WatchedDate, Review
            return `${film.imdb_id},"${item.product.title}",${item.product.release_date.substring(0,4)
            },${item.user_product_info.rate ?? ''},${when},${review}`;
        }
    }
}

async function getReviews(items, ids) {
    ind+= items.length;
    res = await fetch(`https://mustapp.com/api/users/id/${profileID}/products?embed=review`, {
        "headers": headers,
        "body": `{"ids":[${ids}]}`,
        "method": "POST"
    });
    let reviews = await res.json();
    for (let i = 0; i < reviews.length; i++) {
        items[i].product.review = reviews[i].user_product_info.review?.body ?? '';
        items[i].product.review = items[i].product.review.replace(/"/g, '""'); // Escape quotes for CSV
        if (items[i].product.review !== '') {
            items[i].product.review = `"${items[i].product.review}"`; // Wrap in quotes for CSV
        }
    }
    return items;
}

/**
 * Tries to fix the horrible TMDB search algorithm through a series of filters on the results.
 * @param {Object} search - The TMDB API response object.
 * @param {Object} item - The MustApp item object.
 * @returns {Int|undefined} The TMDb ID of the (guessed) movie.
 */
async function guessMovie(search, item) {
    // The first check is title exact match, as it is the most reliable.
    // If there are no results, we try to match the release date.
    // Year match is skipped as it is highly unreliable.
    results = search.results.filter(movie => movie.title == item.product.title);
    if (results.length == 0) {
        results = search.results.filter(movie => movie.release_date == item.product.release_date);
        if (results.length == 0) {
            return search.results[0]?.id || null; // null is the default value to avoid errors
        }
    } else if (results.length > 1) {
        let filtered = results.filter(movie => movie.release_date == item.product.release_date);
        if (filtered.length == 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            // Filters out fakes or duplicates (yes, they can appear in the wrong order...).
            return filtered.find(movie => movie.popularity == Math.max(...filtered.map(m => m.popularity)))?.id || (errorList.push([item.product.title, item.product.release_date]) ? null : null);
        }
        return filtered[0]?.id || null; // null is the default value to avoid errors
    } else {
        return results[0]?.id || null; // null is the default value to avoid errors
    }
    // This is just the old one-line filter.
    // return search.results.find(movie => movie.release_date == item.product.release_date)?.id || search.results[0]?.id || errorList.push([item.product.title, item.product.release_date]); // default value to avoid errors
}
