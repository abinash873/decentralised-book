// migrations/2_deploy_book_rental.js
const BookRental = artifacts.require("BookRental");

module.exports = function(deployer) {
  // Deploy the BookRental contract
  deployer.deploy(BookRental);
};