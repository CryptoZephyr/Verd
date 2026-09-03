// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../contracts/ethereum/ReserveLocker.sol";

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

interface ILockerRelease {
    function release() external returns (uint256);
}

contract MockAToken {
    mapping(address account => uint256 balance) private _balances;
    bool public returnFalse;
    bool public reenter;
    bool private _reentered;
    address public reenterTarget;

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function mint(address account, uint256 amount) external {
        _balances[account] += amount;
    }

    function setReturnFalse(bool value) external {
        returnFalse = value;
    }

    function setReentry(address target, bool value) external {
        reenterTarget = target;
        reenter = value;
        _reentered = false;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (returnFalse) return false;

        if (reenter && !_reentered) {
            _reentered = true;
            try ILockerRelease(reenterTarget).release() returns (uint256) {} catch {}
        }

        require(_balances[msg.sender] >= amount, "balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        return true;
    }
}

contract ReserveLockerTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    event ReserveReleased(address indexed borrower, address indexed aToken, uint256 amount);

    address private constant BORROWER = address(0xBEEF);
    address private constant AAVE_POOL = address(0xA11E);
    address private constant RESERVE_ASSET = address(0xCAFE);
    uint256 private constant RESERVE_AMOUNT = 5 ether;

    MockAToken private token;
    ReserveLocker private locker;
    uint256 private unlockTime;

    function setUp() public {
        token = new MockAToken();
        unlockTime = block.timestamp + 1 days;
        locker = new ReserveLocker(
            BORROWER,
            AAVE_POOL,
            RESERVE_ASSET,
            address(token),
            unlockTime
        );
        token.mint(address(locker), RESERVE_AMOUNT);
    }

    function test_constructorStoresCriticalConfigurationAndEvidenceReads() public view {
        require(locker.borrower() == BORROWER, "borrower");
        require(locker.aavePool() == AAVE_POOL, "pool");
        require(locker.reserveAsset() == RESERVE_ASSET, "reserve");
        require(locker.aToken() == address(token), "aToken");
        require(locker.unlockTime() == unlockTime, "unlock");
        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance");
    }

    function test_constructorRejectsZeroCriticalConfiguration() public {
        vm.expectRevert(ReserveLocker.InvalidConfiguration.selector);
        new ReserveLocker(address(0), AAVE_POOL, RESERVE_ASSET, address(token), unlockTime);

        vm.expectRevert(ReserveLocker.InvalidConfiguration.selector);
        new ReserveLocker(BORROWER, address(0), RESERVE_ASSET, address(token), unlockTime);

        vm.expectRevert(ReserveLocker.InvalidConfiguration.selector);
        new ReserveLocker(BORROWER, AAVE_POOL, address(0), address(token), unlockTime);

        vm.expectRevert(ReserveLocker.InvalidConfiguration.selector);
        new ReserveLocker(BORROWER, AAVE_POOL, RESERVE_ASSET, address(0), unlockTime);

        vm.expectRevert(ReserveLocker.InvalidConfiguration.selector);
        new ReserveLocker(BORROWER, AAVE_POOL, RESERVE_ASSET, address(token), 0);
    }

    function test_constructorRejectsUnlockTimeAtOrBeforeDeployment() public {
        vm.warp(1_000_000);
        vm.expectRevert();
        new ReserveLocker(BORROWER, AAVE_POOL, RESERVE_ASSET, address(token), block.timestamp);

        vm.expectRevert();
        new ReserveLocker(BORROWER, AAVE_POOL, RESERVE_ASSET, address(token), block.timestamp - 1);
    }

    function test_nonBorrowerCannotReleaseBeforeMaturity() public {
        vm.prank(address(0x1234));
        vm.expectRevert(ReserveLocker.OnlyBorrower.selector);
        locker.release();
        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance changed");
    }

    function test_borrowerCannotReleaseBeforeMaturity() public {
        vm.prank(BORROWER);
        vm.expectRevert(ReserveLocker.UnlockTimeNotReached.selector);
        locker.release();
        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance changed");
        require(tokenBalance(BORROWER) == 0, "borrower received funds");
    }

    function test_onlyBorrowerCanReleaseAfterMaturity() public {
        vm.warp(unlockTime);
        vm.prank(address(0x1234));
        vm.expectRevert(ReserveLocker.OnlyBorrower.selector);
        locker.release();
        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance changed");
    }

    function test_borrowerCanReleaseEntireBalanceAtExactMaturity() public {
        vm.warp(unlockTime);
        vm.expectEmit(true, true, false, true);
        emit ReserveReleased(BORROWER, address(token), RESERVE_AMOUNT);
        vm.prank(BORROWER);
        uint256 released = locker.release();

        require(released == RESERVE_AMOUNT, "return amount");
        require(locker.aTokenBalance() == 0, "locker balance");
        require(tokenBalance(BORROWER) == RESERVE_AMOUNT, "borrower balance");
    }

    function test_zeroBalanceCannotRelease() public {
        vm.warp(unlockTime);
        token = new MockAToken();
        uint256 newUnlockTime = block.timestamp + 1;
        locker = new ReserveLocker(
            BORROWER,
            AAVE_POOL,
            RESERVE_ASSET,
            address(token),
            newUnlockTime
        );

        vm.warp(newUnlockTime);
        vm.prank(BORROWER);
        vm.expectRevert(ReserveLocker.NoReserveBalance.selector);
        locker.release();
    }

    function test_failedTokenTransferCannotRelease() public {
        token.setReturnFalse(true);
        vm.warp(unlockTime);
        vm.prank(BORROWER);
        vm.expectRevert(ReserveLocker.TransferFailed.selector);
        locker.release();

        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance changed");
        require(tokenBalance(BORROWER) == 0, "borrower received funds");
    }

    function test_reentrantTokenCannotCreateSecondRelease() public {
        MockAToken reentrantToken = new MockAToken();
        ReserveLocker reentrantLocker = new ReserveLocker(
            address(reentrantToken),
            AAVE_POOL,
            RESERVE_ASSET,
            address(reentrantToken),
            unlockTime
        );
        reentrantToken.mint(address(reentrantLocker), RESERVE_AMOUNT);
        reentrantToken.setReentry(address(reentrantLocker), true);

        vm.warp(unlockTime);
        vm.prank(address(reentrantToken));
        uint256 released = reentrantLocker.release();

        require(released == RESERVE_AMOUNT, "return amount");
        require(reentrantLocker.aTokenBalance() == 0, "locker balance");
        require(tokenBalanceOf(reentrantToken, address(reentrantToken)) == RESERVE_AMOUNT, "double release");
    }

    function test_unknownSelectorsAndValueHaveNoEscapePath() public {
        (bool tokenCall,) = address(locker).call(
            abi.encodeWithSignature("transfer(address,uint256)", address(0x1234), RESERVE_AMOUNT)
        );
        require(!tokenCall, "arbitrary token transfer");

        (bool transferFromCall,) = address(locker).call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)",
                address(locker),
                address(0x1234),
                RESERVE_AMOUNT
            )
        );
        require(!transferFromCall, "arbitrary transferFrom");

        (bool approvalCall,) = address(locker).call(
            abi.encodeWithSignature("approve(address,uint256)", address(0x1234), RESERVE_AMOUNT)
        );
        require(!approvalCall, "arbitrary approval");

        (bool borrowerSetter,) = address(locker).call(
            abi.encodeWithSignature("setBorrower(address)", address(0x1234))
        );
        require(!borrowerSetter, "mutable borrower");

        (bool poolSetter,) = address(locker).call(
            abi.encodeWithSignature("setAavePool(address)", address(0x1234))
        );
        require(!poolSetter, "mutable pool");

        (bool reserveSetter,) = address(locker).call(
            abi.encodeWithSignature("setReserveAsset(address)", address(0x1234))
        );
        require(!reserveSetter, "mutable reserve");

        (bool aTokenSetter,) = address(locker).call(
            abi.encodeWithSignature("setAToken(address)", address(0x1234))
        );
        require(!aTokenSetter, "mutable aToken");

        (bool unlockSetter,) = address(locker).call(
            abi.encodeWithSignature("setUnlockTime(uint256)", unlockTime + 1)
        );
        require(!unlockSetter, "mutable unlock");

        (bool adminCall,) = address(locker).call(
            abi.encodeWithSignature("adminWithdraw(address,uint256)", address(0x1234), RESERVE_AMOUNT)
        );
        require(!adminCall, "admin escape");

        (bool upgradeCall,) = address(locker).call(
            abi.encodeWithSignature("upgradeTo(address)", address(0x1234))
        );
        require(!upgradeCall, "upgrade path");

        (bool ownerCall,) = address(locker).call(abi.encodeWithSignature("owner()"));
        require(!ownerCall, "mutable owner");

        vm.deal(address(this), 1 ether);
        (bool valueCall,) = address(locker).call{value: 1 wei}("");
        require(!valueCall, "payable fallback");
        require(locker.aTokenBalance() == RESERVE_AMOUNT, "balance changed");
    }

    function tokenBalance(address account) private view returns (uint256) {
        return token.balanceOf(account);
    }

    function tokenBalanceOf(MockAToken target, address account) private view returns (uint256) {
        return target.balanceOf(account);
    }
}
