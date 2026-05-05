const query = `query { 
  __type(name: "LocaleString") {
    name
    fields {
      name
      type { name kind }
    }
  }
}`;

fetch('https://czqk28jt.apicdn.sanity.io/v1/graphql/prod_th_us/default', { 
  method: 'POST', 
  headers: {'Content-Type': 'application/json'}, 
  body: JSON.stringify({query}) 
})
.then(r => r.json())
.then(j => console.log(JSON.stringify(j, null, 2)));
