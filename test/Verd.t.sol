// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../contracts/creditcoin/Verd.sol";

interface VmVerd {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

contract VerdTest {
    VmVerd private constant vm = VmVerd(address(uint160(uint256(keccak256("hevm cheat code")))));

    event FacilityCreated(
        bytes32 indexed facilityId,
        address indexed lender,
        address indexed borrower,
        uint256 principal,
        uint256 standardAprBps,
        uint256 preferredAprBps,
        uint64 maturity,
        uint64 qualificationDeadline,
        uint256 requiredReserveAmount,
        address reserveLocker
    );

    address private constant LENDER = address(0x1111);
    address private constant BORROWER = address(0x2222);
    address private constant AAVE_POOL = address(0x3333);
    address private constant RESERVE_ASSET = address(0x4444);
    address private constant ATOKEN = address(0x5555);
    address private constant PROOF_VERIFIER = address(0x6666);
    address private constant RESERVE_LOCKER_FACTORY = address(0x7777);
    bytes32 private constant FACILITY_ID = keccak256("verd-facility-1");
    uint256 private constant PRINCIPAL = 10 ether;
    uint256 private constant STANDARD_APR_BPS = 1_000;
    uint256 private constant PREFERRED_APR_BPS = 500;
    uint256 private constant REQUIRED_RESERVE = 1 ether;

    Verd private verd;
    uint256 private maturity;
    uint256 private qualificationDeadline;

    function setUp() public {
        maturity = block.timestamp + 30 days;
        qualificationDeadline = block.timestamp + 7 days;
        vm.deal(LENDER, 100 ether);
        vm.deal(BORROWER, 100 ether);
        verd = new Verd(PROOF_VERIFIER, RESERVE_LOCKER_FACTORY, AAVE_POOL, RESERVE_ASSET, ATOKEN);
    }

    function test_constructorStoresApprovedSourceConfiguration() public view {
        require(verd.proofVerifier() == PROOF_VERIFIER, "verifier");
        require(verd.approvedReserveLockerFactory() == RESERVE_LOCKER_FACTORY, "factory");
        require(verd.approvedAavePool() == AAVE_POOL, "pool");
        require(verd.approvedReserveAsset() == RESERVE_ASSET, "reserve");
        require(verd.approvedAToken() == ATOKEN, "aToken");
    }

    function test_createFacilityStoresTermsWithoutLockerBinding() public {
        vm.expectEmit(true, true, true, true);
        emit FacilityCreated(
            FACILITY_ID,
            LENDER,
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE,
            address(0)
        );
        vm.prank(LENDER);
        verd.createFacility(
            FACILITY_ID,
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE
        );

        (
            address lender,
            address borrower,
            uint256 principal,
            uint256 outstandingPrincipal,
            uint256 standardAprBps,
            uint256 preferredAprBps,
            uint256 currentAprBps,
            uint256 accruedInterest,
            uint64 storedMaturity,
            uint64 storedDeadline,
            uint256 requiredReserveAmount,
            address reserveLocker
        ) = verd.getFacility(FACILITY_ID);
        (
            uint64 lastAccrualTimestamp,
            bool funded,
            bool drawn,
            bool preferredRateActive,
            bool repaid,
            bool reserveReleased,
            bool drawnAtPreferredRate,
            uint256 repaidAmount
        ) = verd.getFacilityStatus(FACILITY_ID);
        (
            bytes32 qualificationProofId,
            uint64 qualificationSourceBlock,
            uint256 reserveReleaseAmount
        ) = verd.getFacilityProof(FACILITY_ID);

        require(lender == LENDER, "lender");
        require(borrower == BORROWER, "borrower");
        require(principal == PRINCIPAL, "principal");
        require(outstandingPrincipal == 0, "outstanding");
        require(standardAprBps == STANDARD_APR_BPS, "standard APR");
        require(preferredAprBps == PREFERRED_APR_BPS, "preferred APR");
        require(currentAprBps == STANDARD_APR_BPS, "current APR");
        require(accruedInterest == 0, "interest");
        require(storedMaturity == maturity, "maturity");
        require(storedDeadline == qualificationDeadline, "deadline");
        require(requiredReserveAmount == REQUIRED_RESERVE, "reserve amount");
        require(reserveLocker == address(0), "locker");
        require(lastAccrualTimestamp == block.timestamp, "accrual timestamp");
        require(!funded && !drawn && !preferredRateActive && !repaid && !drawnAtPreferredRate, "flags");
        require(!reserveReleased && repaidAmount == 0, "release state");
        require(qualificationProofId == bytes32(0), "proof");
        require(qualificationSourceBlock == 0 && reserveReleaseAmount == 0, "evidence");
        require(verd.lockerFacility(address(0x8888)) == bytes32(0), "binding");
    }

    function test_createFacilityRejectsInvalidTerms() public {
        vm.prank(LENDER);
        vm.expectRevert(Verd.InvalidFacility.selector);
        verd.createFacility(
            bytes32(0),
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE
        );

        vm.expectRevert(Verd.InvalidFacility.selector);
        verd.createFacility(
            FACILITY_ID,
            BORROWER,
            PRINCIPAL,
            PREFERRED_APR_BPS,
            STANDARD_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE
        );

        vm.expectRevert(Verd.InvalidFacility.selector);
        verd.createFacility(
            FACILITY_ID,
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(maturity + 1),
            REQUIRED_RESERVE
        );
    }

    function test_lenderCanFundExactlyOnce() public {
        createFacility();

        vm.expectEmit(true, true, false, true);
        emit Verd.FacilityFunded(FACILITY_ID, LENDER, PRINCIPAL);
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);

        require(address(verd).balance == PRINCIPAL, "escrow");
        require(verd.isFunded(FACILITY_ID), "funded");

        vm.expectRevert(Verd.AlreadyFunded.selector);
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
    }

    function test_fundingRejectsWrongSenderAndAmount() public {
        createFacility();

        vm.expectRevert(Verd.NotLender.selector);
        vm.prank(BORROWER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);

        vm.expectRevert(Verd.FundingAmountMismatch.selector);
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL - 1}(FACILITY_ID);
    }

    function test_borrowerDrawsFundedFacilityAtCurrentRate() public {
        createFacility();
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);

        vm.deal(BORROWER, 0);
        vm.expectEmit(true, true, false, true);
        emit Verd.FacilityDrawn(FACILITY_ID, BORROWER, PRINCIPAL, STANDARD_APR_BPS);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        require(BORROWER.balance == PRINCIPAL, "draw amount");
        (uint256 outstanding,, uint256 currentApr) = verd.getFacilityFinancials(FACILITY_ID);
        require(currentApr == STANDARD_APR_BPS, "draw APR");
        require(verd.facilityState(FACILITY_ID) == Verd.FacilityState.DrawnAtStandardRate, "draw state");
        require(outstanding == PRINCIPAL, "outstanding principal");
    }

    function test_drawRequiresFundingBorrowerAndSingleDraw() public {
        createFacility();

        vm.expectRevert(Verd.NotFunded.selector);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);

        vm.expectRevert(Verd.NotBorrower.selector);
        vm.prank(LENDER);
        verd.drawFacility(FACILITY_ID);

        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.expectRevert(Verd.AlreadyDrawn.selector);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);
    }

    function test_interestAccruesAndRepaymentPaysLenderAtMaturity() public {
        createFacility();
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
        vm.deal(BORROWER, 0);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.warp(block.timestamp + 1 days);
        vm.prank(address(0x7777));
        verd.accrueInterest(FACILITY_ID);
        (uint256 outstanding, uint256 accrued,) = verd.getFacilityFinancials(FACILITY_ID);
        require(outstanding == PRINCIPAL && accrued > 0, "interest accrual");

        uint256 lenderBefore = LENDER.balance;
        vm.warp(maturity);
        uint256 finalAccrued = verd.accrueInterest(FACILITY_ID);
        uint256 due = outstanding + finalAccrued;
        vm.deal(BORROWER, due);
        vm.expectEmit(true, true, true, true);
        emit Verd.FacilityRepaid(FACILITY_ID, BORROWER, LENDER, PRINCIPAL, finalAccrued, due);
        vm.prank(BORROWER);
        verd.repayFacility{value: due}(FACILITY_ID);

        require(LENDER.balance == lenderBefore + due, "lender repayment");
        (uint256 remaining, uint256 recordedInterest,) = verd.getFacilityFinancials(FACILITY_ID);
        require(remaining == 0 && recordedInterest == finalAccrued, "repayment state");
        require(verd.facilityState(FACILITY_ID) == Verd.FacilityState.Repaid, "repaid state");
    }

    function test_repaymentRejectsBeforeMaturityAndWrongAmount() public {
        createFacility();
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
        vm.deal(BORROWER, 0);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.expectRevert(Verd.NotMatured.selector);
        vm.prank(BORROWER);
        verd.repayFacility{value: PRINCIPAL}(FACILITY_ID);

        vm.warp(maturity);
        vm.expectRevert(Verd.RepaymentAmountMismatch.selector);
        vm.prank(BORROWER);
        verd.repayFacility{value: PRINCIPAL - 1}(FACILITY_ID);
    }

    function test_repaymentRefundsAnAmountAboveTheFinalDue() public {
        createFacility();
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.warp(maturity);
        uint256 due = PRINCIPAL + verd.accrueInterest(FACILITY_ID);
        uint256 extra = 1 ether;
        uint256 lenderBefore = LENDER.balance;
        vm.deal(BORROWER, due + extra);
        vm.prank(BORROWER);
        verd.repayFacility{value: due + extra}(FACILITY_ID);

        require(BORROWER.balance == extra, "borrower refund");
        require(LENDER.balance == lenderBefore + due, "lender receives due");
    }

    function createFacility() private {
        vm.prank(LENDER);
        verd.createFacility(
            FACILITY_ID,
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE
        );
    }
}
