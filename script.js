async function retrieveIMDbIDs(username) {
    
    const profileRes = await fetch(`https://mustapp.com/api/users/uri/${username}`);
    const profile = await profileRes.json();
    const listIDs = profile.lists.watched; // the list of Must IDs
    
    const headers = {
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
    
    // slice IDs in chunks of size 100 to match Must limitations
    let IDs = [listIDs.slice(0,100)];
    for (let i = 100; i < listIDs.length; i+=100) {
        IDs.push(listIDs.slice(i,i+100));
    }
    
    // get full info from must ids
    let list = await Promise.all(IDs.map(async ids => 
        fetch(`https://mustapp.com/api/users/id/${profile.id}/products?embed=product`, {
            "headers": headers,
            "body": `{"ids":[${ids}]}`,
            "method": "POST"
        }).then(response => response.json())
    ));
    // leaving the array in chunks
            
    const options = {
        method: 'GET',
        headers: {
            accept: 'application/json',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiMWRiNjExNzc2OTdhMjA2MzBiMmMzMmQyMDA5ODY5YyIsIm5iZiI6MTcyOTAyMjAxOS4xODkwMywic3ViIjoiNjRjYTYxMTgwYjc0ZTkwMGFjNjZjMmE5Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.rslpnPCxpGLXcdYfTyNAuL9Qbd9Zrhy0FjSZG-HRwTw'
        } // kindly don't steal this access token for your personal use, instead get one for free at https://www.themoviedb.org/settings/api
    };
            
    // listDetailed.map(item => ({'title': item.product.title, 'date': item.product.release_date, 'runtime': item.product.runtime}))
    
    let IMDbList = [];
    let errorList = [];
    
    // chop list in even smaller chunks
    list = list.map(chunk => [chunk.slice(0,50),chunk.slice(50,100)]).flat();
    
    list.forEach(chunk => {
        IMDbList.push(...chunk.map(item => 
            fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options)
                .then(response => response.json())
                .then(response => fetch(`https://api.themoviedb.org/3/movie/${response.results.find(movie => movie.release_date == item.product.release_date)?.id || response.results[0].id || errorList.push(item.product.title)}/external_ids`, options))
                .then(response => response.json())
                .then(response => response.imdb_id)
                .catch(err => console.error(err))
        ));
        setTimeout(()=>{}, 1000);
    });

    // let list2 = list.flat();
    // list2.forEach(item => {
    //     IMDbList.push(
    //         fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options)
    //             .then(response => response.json())
    //             .then(response => fetch(`https://api.themoviedb.org/3/movie/${response.results.find(movie => movie.release_date == item.product.release_date)?.id || response.results[0].id}/external_ids`, options))
    //             .then(response => response.json())
    //             .then(response => response.imdb_id)
    //             .catch(err => console.error(err))
    //     );
    //     setTimeout(()=>{}, 100);
    // });

    // list2.reduce((_,item) => (
    //     fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options)
    //         .then(response => response.json())
    //         .then(response => fetch(`https://api.themoviedb.org/3/movie/${response.results.find(movie => movie.release_date == item.product.release_date)?.id || response.results[0].id}/external_ids`, options))
    //         .then(response => response.json())
    //         .then(response => IMDbList.push(response.imdb_id))
    //         .then(setTimeout(()=>{}, 100))
    //         .then(res => res)
    //         .catch(err => console.error(err))
    // ))

    // IMDbList = [];
    // for (i=0; i<list2.length; i++) {
    //     let item = list2[i];
    //     let res = await fetch(`https://api.themoviedb.org/3/search/movie?query=${encodeURI(item.product.title)}&include_adult=true&language=en-US&primary_release_year=${item.product.release_date}&page=1`, options);
    //     let j = await res.json();
    //     IMDbList.push(j.results.find(movie => movie.release_date == item.product.release_date)?.id || j.results[0].id);
    // }

    IMDbList = await Promise.all(IMDbList);
    return IMDbList
}