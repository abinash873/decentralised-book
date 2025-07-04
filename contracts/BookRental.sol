// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract BookRental is ReentrancyGuard {
    // Book struct to store book information
    struct Book {
        string title;
        uint256 dailyPrice;
        uint256 deposit;
        address owner;
        address renter;
        uint256 rentalStartTime;
        uint256 rentalPeriod;
        bool isAvailable;
    }
    
    // Mapping from book ID to Book struct
    mapping(uint256 => Book) public books;
    
    // Counter for book IDs
    uint256 private _nextBookId;
    
    // Events
    event ItemListed(uint256 indexed bookId, string title, uint256 dailyPrice, uint256 deposit, address owner);
    event ItemRented(uint256 indexed bookId, address renter, uint256 rentalStartTime);
    event ItemReturned(uint256 indexed bookId, address renter, uint256 rentalDuration, uint256 rentalFee, uint256 refund);
    event Debug(string message);
    /**
     * @dev List a new book for rental
     * @param _title Title of the book
     * @param _dailyPrice Daily rental price in wei
     * @param _deposit Required deposit amount in wei
     */
    function listItem(string memory _title, uint256 _dailyPrice, uint256 _deposit) external {
        require(_dailyPrice > 0, "Daily price must be greater than 0");
        require(_deposit > 0, "Deposit must be greater than 0");
        
        uint256 bookId = _nextBookId++;
        
        books[bookId] = Book({
            title: _title,
            dailyPrice: _dailyPrice,
            deposit: _deposit,
            owner: msg.sender,
            renter: address(0),
            rentalStartTime: 0,
            rentalPeriod: 7 days,
            isAvailable: true
        });
        
        emit ItemListed(bookId, _title, _dailyPrice, _deposit, msg.sender);
    }
    
    /**
     * @dev Rent a book
     * @param _bookId ID of the book to rent
     */
    function rentItem(uint256 _bookId) external payable nonReentrant {
        Book storage book = books[_bookId];
        
        require(book.owner != address(0), "Book does not exist");
        require(book.isAvailable, "Book is not available for rent");
        require(msg.sender != book.owner, "Owner cannot rent their own book");
        require(msg.value >= book.deposit + book.dailyPrice, "Insufficient payment: need deposit + first day rent");
        
        
        // Update book status
        book.renter = msg.sender;
        book.rentalStartTime = block.timestamp;
        book.isAvailable = false;
        
        emit ItemRented(_bookId, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Return a rented book and process the refund
     * @param _bookId ID of the book to return
     */
    function returnItem(uint256 _bookId) external nonReentrant {
        Book storage book = books[_bookId];
        
        require(book.owner != address(0), "Book does not exist");
        require(!book.isAvailable, "Book is not currently rented");
        require(msg.sender == book.renter, "Only the renter can return the book");
        
        // Calculate rental duration in days (rounded up)
        uint256 duration = (block.timestamp - book.rentalStartTime + 86399) / 86400; // 86400 seconds in a day, +86399 to round up
        
        // Calculate rental fee
        uint256 rentalFee = duration * book.dailyPrice;
        
        // If rental fee exceeds deposit, take the whole deposit
        if (rentalFee >= book.deposit) {
            rentalFee = book.deposit;
        }
        
        // Calculate refund
        uint256 refundAmount = book.deposit - rentalFee;
        
        // Reset book status
        book.isAvailable = true;
        book.renter = address(0);
        book.rentalStartTime = 0;
        
        // Process payments
        payable(book.owner).transfer(rentalFee);
        
        if (refundAmount > 0) {
            payable(msg.sender).transfer(refundAmount);
        }
        
        emit ItemReturned(_bookId, msg.sender, duration, rentalFee, refundAmount);
    }
    /**
 * @dev Claim the full deposit if the renter failed to return the book in time
 * @param _bookId ID of the book to claim deposit for
 */
function claimDepositIfLate(uint256 _bookId) external nonReentrant {
    Book storage book = books[_bookId];

    require(book.owner != address(0), "Book does not exist");
    require(!book.isAvailable, "Book is not currently rented");

    uint256 expectedEndTime = book.rentalStartTime + book.rentalPeriod;
    require(block.timestamp > expectedEndTime, "Rental period has not yet expired");

    // address renter = book.renter;
    uint256 depositAmount = book.deposit;

    // Reset book
    // book.isAvailable = true;
    book.renter = address(0);
    // book.rentalStartTime = 0;
    // book.rentalPeriod = 0;

    // Transfer full deposit to owner
    payable(book.owner).transfer(depositAmount);

    //emit Claim(_bookId, msg.sender, duration, rentalFee, refundAmount);
}

    
    /**
     * @dev Get the list of available books
     * @return Array of book IDs that are available for rent
     */
    function getAvailableBooks() external view returns (uint256[] memory) {
        uint256 availableCount = 0;
        
        // Count available books
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].isAvailable && books[i].owner != address(0)) {
                availableCount++;
            }
        }
        
        // Create array of available book IDs
        uint256[] memory result = new uint256[](availableCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].isAvailable && books[i].owner != address(0)) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get the list of books rented by the caller
     * @return Array of book IDs rented by the caller
     */
    function getMyRentedBooks() external view returns (uint256[] memory) {
        uint256 rentedCount = 0;
        
        // Count rented books
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].renter == msg.sender) {
                rentedCount++;
            }
        }
        
        // Create array of rented book IDs
        uint256[] memory result = new uint256[](rentedCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].renter == msg.sender) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
    
    /**
     * @dev Get the list of books owned by the caller
     * @return Array of book IDs owned by the caller
     */
    function getMyListedBooks() external view returns (uint256[] memory) {
        uint256 ownedCount = 0;
        
        // Count owned books
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].owner == msg.sender) {
                ownedCount++;
            }
        }
        
        // Create array of owned book IDs
        uint256[] memory result = new uint256[](ownedCount);
        uint256 index = 0;
        
        for (uint256 i = 0; i < _nextBookId; i++) {
            if (books[i].owner == msg.sender) {
                result[index] = i;
                index++;
            }
        }
        
        return result;
    }
}