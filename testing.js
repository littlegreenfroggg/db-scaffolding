const order_repository = require("./repository/order_records_repository");

exports.Get10Orders = async function() {
    var results = await order_repository.GetAll();
    if (results && results[0]) {
        console.log(results[0][0]);
    }
    return;
}