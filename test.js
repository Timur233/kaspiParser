const fetch = require('node-fetch');

(async function () {
    const req = await fetch('https://web.umag.kz/rest/cabinet/opr/delivery-orders/list?storeId=4517&fromDate=1637486693000&toDate=1640078693000&pageSize=20&status=WAITING', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'api-ver': '1.4',
                'Authorization': 'u10504.57470792-b443-4968-90e6-b71c1448d37d',
                'client-ver': '1c_integrator_0.0.1',
            },
    });

    const res = await req.json();

    console.log(res);
})()