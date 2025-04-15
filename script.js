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
    msg.innerText += " ~ Errors " + errorList.length + "/" + ids[0] + '\n';
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
        const subIMDbIDs = await convertInfoToIMDbIDs2(subArray, options);
        IMDbIDs = IMDbIDs.concat(subIMDbIDs);
        msg.innerText = "Done " + (IMDbIDs.length) + "/" + mustData.watched.length;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Pause for 2 second
    }
    msg.innerText = "Done " + (IMDbIDs.length) + "/" + mustData.watched.length;
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

async function* convertInfoToIMDbIDs(list, options) {
    for (i=0; i<list.length; i++) {
        let item = list[i];
        let film = undefined;
        window.timeEnded = false;
        let Timeout = setTimeout(function () {window.timeEnded = true; errorList.push(item.product.title); console.log(item.product.title);},2000);
        while (film==undefined && !(window.timeEnded)) {
            let id;
            try {
                let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options);
                let searched = await res.json();
                id = searched.results.find(movie => movie.release_date == item.product.release_date)?.id || searched.results[0].id;
            }
            catch(err) {
                console.log("Error 1: ",err);
            }
            try {
                let res = await fetch(`https://api.themoviedb.org/3/movie/${id}/external_ids`, options);
                film = await res.json();
            }
            catch(err) {
                console.log("Error 2: ",err);
            }
        }
        clearTimeout(Timeout);
        yield film.imdb_id;
    }
}

async function convertInfoToIMDbIDs2(list, options) {
    return Promise.all(list.map(async (item) => {
            let searched = await req1(item, options);
            return await req2(searched, item, options);
    }));
        // setTimeout(()=>{}, 1000);
}

async function req1 (item, options) {
    while (true) {
        let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options);
        let searched = await res.json();
        if (typeof searched !== 'undefined') {
            return searched;
        }
    }
}

async function req2 (response, item, options) {
    let id = await guessMovie(response,item);
    while (true) {
        // response.results.find(movie => movie.release_date == item.product.release_date)?.id || response.results[0]?.id || errorList.push(item.product.title)
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
                console.log(typeof(film.imdb_id),response.results);
                console.log(response.results.find(movie => movie.release_date == item.product.release_date)?.id || response.results[0]?.id || errorList.push(item.product.title));
                film.imdb_id = '';
            }
            // IMDb ID, Title, Year, Rating10, WatchedDate, Review
            return `${film.imdb_id},"${item.product.title}",${item.product.release_date.substring(0,4)},${item.user_product_info.rate},${item.user_product_info.modified_at.substring(0,10)},${review}`;
        }
    }
}

async function guessMovie(response, item) {
    results = response.results.filter(movie => movie.release_date == item.product.release_date);
    if (results.length == 0) {
        results = response.results.filter(movie => movie.release_date.substring(0,4) == item.product.release_date.substring(0,4));
        if (results.length == 0) {
            results = response.results.filter(movie => movie.title == item.product.title);
            if (results.length == 0) {
                return response.results[0]?.id || errorList.push(item.product.title);
            }
        }
    } else if (results.length > 1) {
        let filtered = results.filter(movie => movie.title == item.product.title);
        if (filtered.length == 0) {
            filtered = results;
        }
        if (filtered.length > 1) {
            return filtered.find(movie => movie.popularity == Math.max(...filtered.map(m => m.popularity)))?.id || errorList.push(item.product.title);
        }
        return filtered[0]?.id || errorList.push(item.product.title);
    } else {
        return results[0]?.id || errorList.push(item.product.title);
    }
}