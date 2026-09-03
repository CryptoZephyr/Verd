// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ReserveLocker.sol";

/// @notice Creates one immutable ReserveLocker for each facility on Ethereum Sepolia.
/// @dev The creation event is the cross-chain configuration record authenticated by Verd.
contract ReserveLockerFactory {
    error InvalidConfiguration();
    error FacilityAlreadyCreated(bytes32 facilityId);
    error OnlyBorrower();

    address public immutable aavePool;
    address public immutable reserveAsset;
    address public immutable aToken;

    mapping(bytes32 => address) public facilityLocker;

    event ReserveLockerCreated(
        bytes32 indexed facilityId,
        address indexed locker,
        address indexed borrower,
        address aavePool,
        address reserveAsset,
        address aToken,
        uint64 unlockTime
    );

    constructor(address aavePool_, address reserveAsset_, address aToken_) {
        if (
            aavePool_ == address(0) ||
            reserveAsset_ == address(0) ||
            aToken_ == address(0)
        ) revert InvalidConfiguration();

        aavePool = aavePool_;
        reserveAsset = reserveAsset_;
        aToken = aToken_;
    }

    function createReserveLocker(
        bytes32 facilityId,
        address borrower,
        uint64 unlockTime
    ) external returns (address lockerAddress) {
        if (facilityId == bytes32(0) || borrower == address(0) || unlockTime <= block.timestamp) {
            revert InvalidConfiguration();
        }
        if (msg.sender != borrower) revert OnlyBorrower();
        if (facilityLocker[facilityId] != address(0)) {
            revert FacilityAlreadyCreated(facilityId);
        }

        lockerAddress = address(new ReserveLocker(
            borrower,
            aavePool,
            reserveAsset,
            aToken,
            unlockTime
        ));
        facilityLocker[facilityId] = lockerAddress;

        emit ReserveLockerCreated(
            facilityId,
            lockerAddress,
            borrower,
            aavePool,
            reserveAsset,
            aToken,
            unlockTime
        );
    }
}
