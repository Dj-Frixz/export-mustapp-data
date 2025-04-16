const msg = document.getElementById('message');
const msg2 = document.getElementById('missing');
let errorList = [];
let headers = {};
let profileID;

async function handleButton() {
    document.getElementById("btn").disabled = true;
    let username = document.getElementById('username').value;
    msg.innerText = "Fetching data for "+username+"...\n";
    let ids = await getData(username);
    msg.innerText += " ~ Failed " + errorList.length + "/" + ids[0] + '\n';
    msg2.innerText = "Missing: " + '\n' + errorList.join(",\n");
    const csvContent = "data:text/csv;charset=utf-8," +
    "imdbID,Title,Year,Rating10,WatchedDate,Review \n" +
    ids[1].join('\n');
    // msg.innerText += csvContent;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "watched.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    document.getElementById("btn").disabled = false;
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

    let IMDbIDs = [];
    let k = 50;
    for (let i = 0; i < mustData.watched.length; i += k) {
        const subArray = mustData.watched.slice(i, i + k);
        const subIMDbIDs = await convertInfoToIMDbIDs(subArray, options);
        IMDbIDs = IMDbIDs.concat(subIMDbIDs);
        msg.innerText = "Processed " + (IMDbIDs.length) + "/" + mustData.watched.length;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pause for 2 second
    }
    msg.innerText = "Processed " + (IMDbIDs.length) + "/" + mustData.watched.length;
    return [mustData.watched.length,IMDbIDs];
}

async function exportMustData(username) {
    
    const profileRes = await fetch(`https://mustapp.com/api/users/uri/${username}`);
    const profile = await profileRes.json();
    profileID = profile.id;
    const want = profile.lists.want; // the list of Must IDs for films in watchlist
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
    let filmList= await Promise.all(IDs.map(async ids => 
        fetch(`https://mustapp.com/api/users/id/${profileID}/products?embed=product`, {
            "headers": headers,
            "body": `{"ids":[${ids}]}`,
            "method": "POST"
        }).then(response => response.json())
    ));

    return filmList.flat()
}

async function convertInfoToIMDbIDs(list, options) {
    return Promise.all(list.map(async (item) => {
            let search = await searchOnTMDB(item, options);
            let id = search.results[0]?.id || errorList.push(item.product.title);
            if (search.results.length > 1) {
                id = await guessMovie(search, item);
            }
            return getIMDBid(id, item, options);
    }));
}

/**
 * Search for a movie on TMDB using the title and year from the MustApp item.
 * @param {Object} item - The MustApp item object.
 * @param {Object} options - The options for the TMDB API request.
 * @returns {Object} The TMDB API response object.
 */
async function searchOnTMDB (item, options) {
    while (true) {
        // if it doesn't work, it could be useful retrying with primary_release_year instead of year
        let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&year=${item.product.release_date}&page=1`, options);
        let search = await res.json();
        if (typeof search !== 'undefined') {
            return search;
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
async function getIMDBid (id, item, options) {
    while (true) {
        let res = await fetch(`https://api.themoviedb.org/3/movie/${id}/external_ids`, options);
        let film = await res.json();
        if (typeof film !== 'undefined') {
            let review = '';
            if (item.user_product_info.reviewed) {
                res = await fetch(`https://mustapp.com/api/users/id/${profileID}/products?embed=review`, {
                    "headers": headers,
                    "body": `{"ids":[${item.product.id}]}`,
                    "method": "POST"
                });
                review = await res.json();
                review = '"' + review[0].user_product_info.review.body + '"';
            }
            if (film.imdb_id == null || film.imdb_id == undefined) {
                errorList.push([item.product.title, item.product.release_date]);
                film.imdb_id = '';
            }
            // IMDb ID, Title, Year, Rating10, WatchedDate, Review
            return `${film.imdb_id},"${item.product.title}",${item.product.release_date.substring(0,4)},${item.user_product_info.rate},${item.user_product_info.modified_at.substring(0,10)},${review}`;
        }
    }
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
            return search.results[0]?.id || errorList.push(item.product.title);
        }
    } else if (results.length > 1) {
        let filtered = results.filter(movie => movie.release_date == item.product.release_date);
        if (filtered.length == 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            // Filters out fakes or duplicates (yes, they can appear in the wrong order...).
            return filtered.find(movie => movie.popularity == Math.max(...filtered.map(m => m.popularity)))?.id || errorList.push(item.product.title);
        }
        return filtered[0]?.id || errorList.push(item.product.title);
    } else {
        return results[0]?.id || errorList.push(item.product.title);
    }
    // This is just the old one-line filter.
    // return search.results.find(movie => movie.release_date == item.product.release_date)?.id || search.results[0]?.id || errorList.push(item.product.title); // default value to avoid errors
}