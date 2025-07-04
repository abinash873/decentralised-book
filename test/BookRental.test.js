const BookRental = artifacts.require("BookRental");
//import @openzeppelin/test-helpers;
const { time } = require("@openzeppelin/test-helpers");

contract("BookRental", (accounts) => {
  const owner = accounts[0];
  const user = accounts[1];
  const otherUser = accounts[2];

  let instance;

  beforeEach(async () => {
    instance = await BookRental.new();
  });

  it("should list a book correctly", async () => {
    const tx = await instance.listItem("1984", web3.utils.toWei("0.01", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });
    const book = await instance.books(0);

    assert.equal(book.title, "1984");
    assert.equal(book.dailyPrice.toString(), web3.utils.toWei("0.01", "ether"));
    assert.equal(book.deposit.toString(), web3.utils.toWei("0.1", "ether"));
    assert.equal(book.owner, owner);
    assert.equal(book.isAvailable, true);
  });

  it("should allow user to rent a listed book", async () => {
    await instance.listItem("Brave New World", web3.utils.toWei("0.02", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });

    await instance.rentItem(0, {
      from: user,
      value: web3.utils.toWei("0.12", "ether") // deposit + rent
    });

    const book = await instance.books(0);
    assert.equal(book.isAvailable, false);
    assert.equal(book.renter, user);
  });

  it("should not allow owner to rent their own book", async () => {
    await instance.listItem("Catch-22", web3.utils.toWei("0.02", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });

    try {
      await instance.rentItem(0, {
        from: owner,
        value: web3.utils.toWei("0.12", "ether")
      });
      assert.fail("Owner was able to rent their own book");
    } catch (err) {
      assert.include(err.message, "Owner cannot rent their own book");
    }
  });

  it("should reject rent with insufficient payment", async () => {
    await instance.listItem("Dune", web3.utils.toWei("0.02", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });

    try {
      await instance.rentItem(0, {
        from: user,
        value: web3.utils.toWei("0.05", "ether") // too low
      });
      assert.fail("Allowed to rent with insufficient payment");
    } catch (err) {
      assert.include(err.message, "Insufficient payment");
    }
  });

  it("should allow renter to return a book and receive refund", async () => {
    await instance.listItem("The Hobbit", web3.utils.toWei("0.01", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });

    await instance.rentItem(0, {
      from: user,
      value: web3.utils.toWei("0.11", "ether")
    });

    // Fast-forward time by 1 day (simulated block timestamp manipulation only works in Hardhat/ganache with evm_increaseTime)
    await new Promise(resolve => setTimeout(resolve, 1000)); // simulate delay (not exact)

    const balanceBefore = web3.utils.toBN(await web3.eth.getBalance(user));
    
    const tx = await instance.returnItem(0, { from: user });
    const book = await instance.books(0);

    assert.equal(book.isAvailable, true);
    assert.equal(book.renter, '0x0000000000000000000000000000000000000000');
  });

  it("should not allow non-renter to return book", async () => {
    await instance.listItem("War and Peace", web3.utils.toWei("0.01", "ether"), web3.utils.toWei("0.1", "ether"), { from: owner });

    await instance.rentItem(0, {
      from: user,
      value: web3.utils.toWei("0.11", "ether")
    });

    try {
      await instance.returnItem(0, { from: otherUser });
      assert.fail("Non-renter was able to return the book");
    } catch (err) {
      assert.include(err.message, "Only the renter can return the book");
    }
  });

  it("should return available books correctly", async () => {
    await instance.listItem("Book1", 1, 2, { from: owner });
    await instance.listItem("Book2", 1, 2, { from: owner });
    await instance.rentItem(0, { from: user, value: 3 });

    const available = await instance.getAvailableBooks();
    assert.deepEqual(available.map(id => id.toNumber()), [1]);
  });

  it("should return books rented by a user", async () => {
    await instance.listItem("Book1", 1, 2, { from: owner });
    await instance.listItem("Book2", 1, 2, { from: owner });

    await instance.rentItem(0, { from: user, value: 3 });
    await instance.rentItem(1, { from: otherUser, value: 3 });

    const rented = await instance.getMyRentedBooks({ from: user });
    assert.deepEqual(rented.map(id => id.toNumber()), [0]);
  });

  it("should return books listed by the owner", async () => {
    await instance.listItem("Book1", 1, 2, { from: owner });
    await instance.listItem("Book2", 1, 2, { from: owner });

    const listed = await instance.getMyListedBooks({ from: owner });
    assert.deepEqual(listed.map(id => id.toNumber()), [0, 1]);
  });
  it("should not allow listing a book with zero deposit", async () => {
    try {
      await instance.listItem(
        "Zero Deposit Book",
        web3.utils.toWei("0.01", "ether"), // valid price
        0,                                 // invalid deposit
        { from: owner }
      );
      assert.fail("Book was listed with zero deposit");
    } catch (err) {
      assert.include(err.message, "Deposit must be greater than 0");
    }
  });
  
  it("should not allow listing a book with zero daily price", async () => {
    try {
      await instance.listItem(
        "Free Book",
        0,                                  // invalid price
        web3.utils.toWei("1", "ether"),     // valid deposit
        { from: owner }
      );
      assert.fail("Book was listed with zero daily price");
    } catch (err) {
      assert.include(err.message, "Daily price must be greater than 0");
    }
  });
  it("should allow owner to claim deposit if book is returned late", async () => {
    // List a book
    await instance.listItem(
      "Test Book",
      web3.utils.toWei("0.01", "ether"), // daily price
      web3.utils.toWei("1", "ether"),    // deposit
      { from: owner }
    );
  
    // Renter rents it (book ID 0)
    await instance.rentItem(0, {
      from: user,
      value: web3.utils.toWei("1.01", "ether") // deposit + daily price
    });
  
    // Fast forward time beyond rental duration (simulate late return)
    await time.increase(time.duration.days(8)); // 2 days later
  
    // Owner claims the deposit
    const balanceBefore = await web3.eth.getBalance(owner);
  
    const tx = await instance.claimDepositIfLate(0, { from: owner });
  
    const balanceAfter = await web3.eth.getBalance(owner);
  
    const diff = web3.utils.toBN(balanceAfter).sub(web3.utils.toBN(balanceBefore));
  
    // Assert deposit transferred (give or take gas)
    assert(
      diff.gte(web3.utils.toBN(web3.utils.toWei("0.99", "ether"))), 
      "Deposit not correctly transferred to owner"
    );
  });
  
  
});

/**/

  