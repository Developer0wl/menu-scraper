const query = `query { 
  allItems(limit: 1000) { 
    _id 
    name { en } 
    allergens { 
      milk 
      eggs 
      fish 
      shellfish 
      treeNuts 
      peanuts 
      wheat 
      soy 
      sesame
      mustard
      celery
      lupin
      sulphurDioxide
      gluten
    } 
  } 
}`;

fetch('https://czqk28jt.apicdn.sanity.io/v1/graphql/prod_th_us/default', { 
  method: 'POST', 
  headers: {'Content-Type': 'application/json'}, 
  body: JSON.stringify({query}) 
})
.then(r => r.json())
.then(json => {
   if (json.errors) {
      console.log('Errors:', JSON.stringify(json.errors, null, 2));
   } else {
      const items = json.data.allItems;
      const withAllergens = items.filter(i => i.allergens && Object.values(i.allergens).some(v => v !== null));
      const peanut3 = withAllergens.find(i => i.allergens.peanuts === 3);
      console.log('Peanut 3:', peanut3 ? peanut3.name.en : 'None');
      const peanut1 = withAllergens.find(i => i.allergens.peanuts === 1);
      console.log('Peanut 1:', peanut1 ? peanut1.name.en : 'None');
      const milk2 = withAllergens.find(i => i.allergens.milk === 2);
      console.log('Milk 2:', milk2 ? milk2.name.en : 'None');
   }
});
