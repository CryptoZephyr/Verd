// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20Reserve {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice Holds the Aave aToken position for one Verd facility.
/// @dev The contract deliberately has no admin path, arbitrary call path, or upgrade path.
contract ReserveLocker {
    error InvalidConfiguration();
    error OnlyBorrower();
    error UnlockTimeNotReached();
    error NoReserveBalance();
    error TransferFailed();
    error ReentrantRelease();

    address public immutable borrower;
    address public immutable aavePool;
    address public immutable reserveAsset;
    address public immutable aToken;
    uint256 public immutable unlockTime;

    bool private _releaseInProgress;

    event ReserveReleased(address indexed borrower, address indexed aToken, uint256 amount);

    constructor(
        address borrower_,
        address aavePool_,
        address reserveAsset_,
        address aToken_,
        uint256 unlockTime_
    ) {
        if (
            borrower_ == address(0) ||
            aavePool_ == address(0) ||
            reserveAsset_ == address(0) ||
            aToken_ == address(0) ||
            unlockTime_ <= block.timestamp
        ) revert InvalidConfiguration();

        borrower = borrower_;
        aavePool = aavePool_;
        reserveAsset = reserveAsset_;
        aToken = aToken_;
        unlockTime = unlockTime_;
    }

    function aTokenBalance() external view returns (uint256) {
        return IERC20Reserve(aToken).balanceOf(address(this));
    }

    function release() external returns (uint256 amount) {
        if (msg.sender != borrower) revert OnlyBorrower();
        if (block.timestamp < unlockTime) revert UnlockTimeNotReached();
        if (_releaseInProgress) revert ReentrantRelease();

        _releaseInProgress = true;

        amount = IERC20Reserve(aToken).balanceOf(address(this));
        if (amount == 0) revert NoReserveBalance();
        if (!IERC20Reserve(aToken).transfer(borrower, amount)) revert TransferFailed();

        _releaseInProgress = false;

        emit ReserveReleased(borrower, aToken, amount);
    }
}
