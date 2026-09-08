// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../contracts/creditcoin/Verd.sol";
import "@gluwa/usc-contracts/contracts/write-ability/abstract/IUSCProofVerifier.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/BlockProverTypes.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

interface VmVerdProof {
    function deal(address account, uint256 newBalance) external;
    function expectEmit(bool checkTopic1, bool checkTopic2, bool checkTopic3, bool checkData) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function prank(address sender) external;
    function warp(uint256 newTimestamp) external;
}

contract MockProofVerifier is IUSCProofVerifier {
    bytes private _encodedTransaction;
    bool public revertVerification;
    uint256 public verificationCalls;

    function setEncodedTransaction(bytes calldata encodedTransaction_) external {
        _encodedTransaction = encodedTransaction_;
    }

    function setRevertVerification(bool value) external {
        revertVerification = value;
    }

    function verifyProofs(
        bytes32,
        uint64,
        BlockProverTypes.InclusionProof calldata,
        BlockProverTypes.ContinuityProof calldata
    ) external override returns (bytes memory encodedTransaction) {
        verificationCalls += 1;
        if (revertVerification) revert("mock proof failure");
        return _encodedTransaction;
    }

    function calculateTxIndex(
        BlockProverTypes.InclusionProof calldata
    ) external pure override returns (uint64) {
        return 0;
    }
}

contract MockLockerForProof {
    address public borrower;
    address public aavePool;
    address public reserveAsset;
    address public aToken;
    uint256 public unlockTime;

    constructor(
        address borrower_,
        address aavePool_,
        address reserveAsset_,
        address aToken_,
        uint256 unlockTime_
    ) {
        borrower = borrower_;
        aavePool = aavePool_;
        reserveAsset = reserveAsset_;
        aToken = aToken_;
        unlockTime = unlockTime_;
    }

    function setConfiguration(
        address borrower_,
        address aavePool_,
        address reserveAsset_,
        address aToken_,
        uint256 unlockTime_
    ) external {
        borrower = borrower_;
        aavePool = aavePool_;
        reserveAsset = reserveAsset_;
        aToken = aToken_;
        unlockTime = unlockTime_;
    }
}

contract VerdProofTest {
    VmVerdProof private constant vm = VmVerdProof(address(uint160(uint256(keccak256("hevm cheat code")))));

    event PreferredRateConditionActivated(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address borrower,
        address locker,
        address reserveAsset,
        uint256 suppliedAmount,
        uint256 previousAprBps,
        uint256 newAprBps,
        uint256 accruedInterest
    );

    event ReserveReleaseRecorded(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address borrower,
        address locker,
        uint256 amount
    );

    address private constant LENDER = address(0x1111);
    address private constant BORROWER = address(0x2222);
    address private constant AAVE_POOL = address(0x3333);
    address private constant RESERVE_ASSET = address(0x4444);
    address private constant ATOKEN = address(0x5555);
    address private constant FACTORY = address(0x6666);
    bytes32 private constant FACILITY_ID = keccak256("verd-proof-facility");
    uint64 private constant SOURCE_BLOCK = 12_345;
    uint64 private constant RELEASE_SOURCE_BLOCK = 12_346;
    uint64 private constant FACTORY_SOURCE_BLOCK = 12_344;
    uint256 private constant PRINCIPAL = 10 ether;
    uint256 private constant REQUIRED_RESERVE = 1 ether;
    uint256 private constant SUPPLIED_AMOUNT = 2 ether;
    uint256 private constant STANDARD_APR_BPS = 1_000;
    uint256 private constant PREFERRED_APR_BPS = 500;

    Verd private verd;
    MockProofVerifier private verifier;
    MockLockerForProof private locker;
    uint256 private maturity;
    uint256 private qualificationDeadline;

    function setUp() public {
        vm.deal(LENDER, 100 ether);
        maturity = block.timestamp + 30 days;
        qualificationDeadline = block.timestamp + 7 days;
        locker = new MockLockerForProof(
            BORROWER,
            AAVE_POOL,
            RESERVE_ASSET,
            ATOKEN,
            maturity
        );
        verifier = new MockProofVerifier();
        verd = new Verd(address(verifier), FACTORY, AAVE_POOL, RESERVE_ASSET, ATOKEN);
    }

    function test_validProofActivatesPreferredRateAndRecordsEvidence() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();
        bytes32 expectedProofId = verd.proofId(1, SOURCE_BLOCK, inclusion, continuity);

        vm.expectEmit(true, true, true, true);
        emit PreferredRateConditionActivated(
            FACILITY_ID,
            expectedProofId,
            SOURCE_BLOCK,
            BORROWER,
            address(locker),
            RESERVE_ASSET,
            SUPPLIED_AMOUNT,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            0
        );
        vm.prank(address(0x9999));
        bytes32 actualProofId = verd.qualifyFacility(
            FACILITY_ID,
            1,
            SOURCE_BLOCK,
            inclusion,
            continuity
        );

        require(actualProofId == expectedProofId, "proof id");
        require(verd.processedProof(expectedProofId), "proof not processed");
        (
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 currentAprBps,
            uint256 accruedInterest,
            ,
            ,
            ,
        ) = verd.getFacility(FACILITY_ID);
        require(currentAprBps == PREFERRED_APR_BPS, "preferred APR");
        require(accruedInterest == 0, "unexpected interest");
        (
            ,
            ,
            ,
            bool preferredRateActive,
            ,
            ,
            ,
        ) = verd.getFacilityStatus(FACILITY_ID);
        require(preferredRateActive, "condition inactive");
        (bytes32 proofId, uint64 sourceBlock, uint256 releaseAmount) = verd.getFacilityProof(FACILITY_ID);
        require(proofId == expectedProofId, "stored proof");
        require(sourceBlock == SOURCE_BLOCK && releaseAmount == 0, "proof evidence");
    }

    function test_duplicateConditionExecutionIsRejected() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();

        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);

        vm.expectRevert(abi.encodeWithSelector(Verd.QualificationAlreadyActive.selector, FACILITY_ID));
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_validReleaseProofRecordsCompletion() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory qualificationInclusion, BlockProverTypes.ContinuityProof memory qualificationContinuity) = validProof();
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, qualificationInclusion, qualificationContinuity);

        vm.deal(BORROWER, 100 ether);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        vm.warp(maturity);
        verd.accrueInterest(FACILITY_ID);
        (uint256 outstanding, uint256 accrued,) = verd.getFacilityFinancials(FACILITY_ID);
        uint256 due = outstanding + accrued;
        vm.deal(BORROWER, due);
        vm.prank(BORROWER);
        verd.repayFacility{value: due}(FACILITY_ID);

        verifier.setEncodedTransaction(validReleaseEncodedTransaction());
        (BlockProverTypes.InclusionProof memory releaseInclusion, BlockProverTypes.ContinuityProof memory releaseContinuity) = validReleaseProof();
        bytes32 expectedProofId = verd.proofId(1, RELEASE_SOURCE_BLOCK, releaseInclusion, releaseContinuity);

        vm.expectEmit(true, true, true, true);
        emit ReserveReleaseRecorded(
            FACILITY_ID,
            expectedProofId,
            RELEASE_SOURCE_BLOCK,
            BORROWER,
            address(locker),
            SUPPLIED_AMOUNT
        );
        bytes32 actualProofId = verd.recordReserveRelease(
            FACILITY_ID,
            1,
            RELEASE_SOURCE_BLOCK,
            releaseInclusion,
            releaseContinuity
        );

        require(actualProofId == expectedProofId, "release proof id");
        require(verd.processedProof(expectedProofId), "release proof not processed");
        (,,, bool preferredRateActive, bool repaid, bool reserveReleased,, uint256 repaidAmount) = verd.getFacilityStatus(FACILITY_ID);
        require(preferredRateActive, "preferred rate lost");
        require(repaid && reserveReleased, "completion state incomplete");
        require(repaidAmount == due, "repayment amount");
        require(verd.facilityState(FACILITY_ID) == Verd.FacilityState.Complete, "facility not complete");
        (bytes32 releaseProofId, uint64 releaseSourceBlock, uint256 releaseAmount) = verd.getFacilityReleaseEvidence(FACILITY_ID);
        require(releaseProofId == expectedProofId, "stored release proof");
        require(releaseSourceBlock == RELEASE_SOURCE_BLOCK && releaseAmount == SUPPLIED_AMOUNT, "release evidence");
    }

    function test_sameProofCannotAffectMultipleFacilities() public {
        createAndFund();
        bytes32 secondFacilityId = keccak256("verd-proof-facility-2");
        address secondLocker = address(0xABCD);
        createFacilityOnly(secondFacilityId);
        verifier.setEncodedTransaction(
            encodedFactoryTransaction(
                BORROWER,
                FACTORY,
                secondFacilityId,
                secondLocker,
                BORROWER,
                uint64(maturity)
            )
        );
        (BlockProverTypes.InclusionProof memory factoryInclusion, BlockProverTypes.ContinuityProof memory factoryContinuity) =
            alternateFactoryProof();
        verd.bindReserveLocker(secondFacilityId, 1, FACTORY_SOURCE_BLOCK + 1, factoryInclusion, factoryContinuity);
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(secondFacilityId);

        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();
        bytes32 expectedProofId = verd.proofId(1, SOURCE_BLOCK, inclusion, continuity);
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);

        vm.expectRevert(abi.encodeWithSelector(Verd.ProofAlreadyProcessed.selector, expectedProofId));
        verd.qualifyFacility(secondFacilityId, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_qualificationAccruesExistingRateBeforeSwitchingFutureInterest() public {
        createAndFund();
        vm.deal(BORROWER, 0);
        vm.prank(BORROWER);
        verd.drawFacility(FACILITY_ID);

        uint256 elapsedBeforeQualification = 1 days;
        (uint64 drawTimestamp,,,,,,,) = verd.getFacilityStatus(FACILITY_ID);
        vm.warp(uint256(drawTimestamp) + elapsedBeforeQualification);
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();

        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);

        (uint64 qualificationTimestamp,,,,,,,) = verd.getFacilityStatus(FACILITY_ID);
        uint256 expectedExistingInterest =
            PRINCIPAL * STANDARD_APR_BPS * (uint256(qualificationTimestamp) - drawTimestamp) /
            verd.BASIS_POINTS() /
            verd.SECONDS_PER_YEAR();
        (uint256 outstanding, uint256 accrued, uint256 currentAprBps) = verd.getFacilityFinancials(FACILITY_ID);
        require(outstanding == PRINCIPAL, "principal changed");
        require(accrued == expectedExistingInterest, "past interest repriced");
        require(currentAprBps == PREFERRED_APR_BPS, "future APR");

        uint256 elapsedAfterQualification = 1 days;
        vm.warp(uint256(qualificationTimestamp) + elapsedAfterQualification);
        verd.accrueInterest(FACILITY_ID);
        (, uint256 totalAccrued,) = verd.getFacilityFinancials(FACILITY_ID);
        (uint64 futureAccrualTimestamp,,,,,,,) = verd.getFacilityStatus(FACILITY_ID);
        uint256 expectedFutureInterest =
            PRINCIPAL * PREFERRED_APR_BPS * (uint256(futureAccrualTimestamp) - qualificationTimestamp) /
            verd.BASIS_POINTS() /
            verd.SECONDS_PER_YEAR();
        require(totalAccrued == expectedExistingInterest + expectedFutureInterest, "future interest");
    }

    function test_proofVerifierFailurePreventsStateChange() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        verifier.setRevertVerification(true);
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();

        vm.expectRevert();
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
        require(verd.facilityExists(FACILITY_ID), "facility disappeared");
        require(
            verd.facilityState(FACILITY_ID) == Verd.FacilityState.AwaitingBorrowerAction,
            "condition changed"
        );
    }

    function test_rejectsUnsupportedSourceChainBeforeVerifier() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();
        uint256 callsBefore = verifier.verificationCalls();

        vm.expectRevert(Verd.UnsupportedSourceChain.selector);
        verd.qualifyFacility(FACILITY_ID, 2, SOURCE_BLOCK, inclusion, continuity);
        require(verifier.verificationCalls() == callsBefore, "unsupported chain reached verifier");
    }

    function test_rejectsFailedSourceTransaction() public {
        expectQualificationRevert(
            Verd.SourceTransactionFailed.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 0, 0, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSourceBorrower() public {
        expectQualificationRevert(
            Verd.SourceBorrowerMismatch.selector,
            encodedTransaction(address(0xABCD), AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSourcePool() public {
        expectQualificationRevert(
            Verd.SourcePoolMismatch.selector,
            encodedTransaction(BORROWER, address(0xABCD), AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSupplyEmitter() public {
        expectQualificationRevert(
            Verd.SupplyEventMissing.selector,
            encodedTransaction(BORROWER, AAVE_POOL, address(0xABCD), RESERVE_ASSET, BORROWER, address(locker), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSupplyReserve() public {
        expectQualificationRevert(
            Verd.WrongSupplyReserve.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, address(0xABCD), BORROWER, address(locker), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSupplyUser() public {
        expectQualificationRevert(
            Verd.WrongSupplyUser.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, address(0xABCD), address(locker), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongSupplyLocker() public {
        expectQualificationRevert(
            Verd.WrongSupplyLocker.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(0xABCD), 0, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsWrongReferralCode() public {
        expectQualificationRevert(
            Verd.WrongReferralCode.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 1, 1, SUPPLIED_AMOUNT, true)
        );
    }

    function test_rejectsMissingSupplyEvent() public {
        expectQualificationRevert(
            Verd.SupplyEventMissing.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 0, 1, SUPPLIED_AMOUNT, false)
        );
    }

    function test_rejectsInsufficientSupplyAmount() public {
        expectQualificationRevert(
            Verd.InsufficientSupplyAmount.selector,
            encodedTransaction(BORROWER, AAVE_POOL, AAVE_POOL, RESERVE_ASSET, BORROWER, address(locker), 0, 1, REQUIRED_RESERVE - 1, true)
        );
    }

    function test_rejectsExpiredQualification() public {
        createAndFund();
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();
        uint256 callsBefore = verifier.verificationCalls();
        vm.warp(qualificationDeadline + 1);

        vm.expectRevert(Verd.QualificationExpired.selector);
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
        require(verifier.verificationCalls() == callsBefore, "expired proof reached verifier");
    }

    function test_qualificationRequiresAuthenticatedLocker() public {
        createFacilityOnly();
        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
        verifier.setEncodedTransaction(validEncodedTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();

        vm.expectRevert(Verd.LockerNotBound.selector);
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
        require(verifier.verificationCalls() == 0, "unbound facility reached verifier");
    }

    function expectQualificationRevert(bytes4 expectedError, bytes memory encodedTransaction_) private {
        createAndFund();
        verifier.setEncodedTransaction(encodedTransaction_);
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) = validProof();

        vm.expectRevert(expectedError);
        verd.qualifyFacility(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
        require(!verd.processedProof(verd.proofId(1, SOURCE_BLOCK, inclusion, continuity)), "invalid proof processed");
    }

    function createAndFund() private {
        createFacilityOnly();
        verifier.setEncodedTransaction(validFactoryTransaction());
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) =
            validFactoryProof();
        verd.bindReserveLocker(FACILITY_ID, 1, FACTORY_SOURCE_BLOCK, inclusion, continuity);

        vm.prank(LENDER);
        verd.fundFacility{value: PRINCIPAL}(FACILITY_ID);
    }

    function createFacilityOnly() private {
        createFacilityOnly(FACILITY_ID);
    }

    function createFacilityOnly(bytes32 facilityId) private {
        vm.prank(LENDER);
        verd.createFacility(
            facilityId,
            BORROWER,
            PRINCIPAL,
            STANDARD_APR_BPS,
            PREFERRED_APR_BPS,
            uint64(maturity),
            uint64(qualificationDeadline),
            REQUIRED_RESERVE
        );
    }

    function validFactoryTransaction() private view returns (bytes memory) {
        return encodedFactoryTransaction(
            BORROWER,
            FACTORY,
            FACILITY_ID,
            address(locker),
            BORROWER,
            uint64(maturity)
        );
    }

    function encodedFactoryTransaction(
        address txFrom,
        address txTo,
        bytes32 eventFacilityId,
        address eventLocker,
        address eventBorrower,
        uint64 unlockTime
    ) private pure returns (bytes memory encoded) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256(
            "ReserveLockerCreated(bytes32,address,address,address,address,address,uint64)"
        );
        topics[1] = eventFacilityId;
        topics[2] = bytes32(uint256(uint160(eventLocker)));
        topics[3] = bytes32(uint256(uint160(eventBorrower)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: txTo,
            topics: topics,
            data: abi.encode(AAVE_POOL, RESERVE_ASSET, ATOKEN, unlockTime)
        });

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(
            uint64(1),
            uint64(300_000),
            txFrom,
            false,
            txTo,
            uint256(0),
            bytes("")
        );
        chunks[1] = abi.encode(uint128(1), uint256(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(uint8(1), uint64(100_000), logs, bytes(""));
        encoded = abi.encode(uint8(0), chunks);
    }

    function validEncodedTransaction() private view returns (bytes memory) {
        return encodedTransaction(
            BORROWER,
            AAVE_POOL,
            AAVE_POOL,
            RESERVE_ASSET,
            BORROWER,
            address(locker),
            0,
            1,
            SUPPLIED_AMOUNT,
            true
        );
    }

    function encodedTransaction(
        address txFrom,
        address txTo,
        address logEmitter,
        address reserve,
        address user,
        address onBehalfOf,
        uint16 referralCode,
        uint8 receiptStatus,
        uint256 amount,
        bool includeSupply
    ) private pure returns (bytes memory encoded) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](includeSupply ? 1 : 0);
        if (includeSupply) {
            bytes32[] memory topics = new bytes32[](4);
            topics[0] = keccak256("Supply(address,address,address,uint256,uint16)");
            topics[1] = bytes32(uint256(uint160(reserve)));
            topics[2] = bytes32(uint256(uint160(onBehalfOf)));
            topics[3] = bytes32(uint256(referralCode));
            logs[0] = EvmV1Decoder.LogEntryTuple({
                address_: logEmitter,
                topics: topics,
                data: abi.encode(user, amount)
            });
        }

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(
            uint64(1),
            uint64(300_000),
            txFrom,
            false,
            txTo,
            uint256(0),
            bytes("")
        );
        chunks[1] = abi.encode(uint128(1), uint256(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(receiptStatus, uint64(100_000), logs, bytes(""));
        encoded = abi.encode(uint8(0), chunks);
    }

    function validReleaseEncodedTransaction() private view returns (bytes memory) {
        return encodedReleaseTransaction(BORROWER, address(locker), BORROWER, ATOKEN, SUPPLIED_AMOUNT, true);
    }

    function encodedReleaseTransaction(
        address txFrom,
        address txTo,
        address eventBorrower,
        address eventAToken,
        uint256 amount,
        bool includeRelease
    ) private pure returns (bytes memory encoded) {
        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](includeRelease ? 1 : 0);
        if (includeRelease) {
            bytes32[] memory topics = new bytes32[](3);
            topics[0] = keccak256("ReserveReleased(address,address,uint256)");
            topics[1] = bytes32(uint256(uint160(eventBorrower)));
            topics[2] = bytes32(uint256(uint160(eventAToken)));
            logs[0] = EvmV1Decoder.LogEntryTuple({
                address_: txTo,
                topics: topics,
                data: abi.encode(amount)
            });
        }

        bytes[] memory chunks = new bytes[](3);
        chunks[0] = abi.encode(
            uint64(1),
            uint64(300_000),
            txFrom,
            false,
            txTo,
            uint256(0),
            bytes("")
        );
        chunks[1] = abi.encode(uint128(1), uint256(0), bytes32(0), bytes32(0));
        chunks[2] = abi.encode(uint8(1), uint64(100_000), logs, bytes(""));
        encoded = abi.encode(uint8(0), chunks);
    }

    function validProof()
        private
        pure
        returns (
            BlockProverTypes.InclusionProof memory inclusion,
            BlockProverTypes.ContinuityProof memory continuity
        )
    {
        BlockProverTypes.MerkleProofEntry[] memory siblings = new BlockProverTypes.MerkleProofEntry[](0);
        inclusion = BlockProverTypes.InclusionProof({
            kind: BlockProverTypes.ProofKind.BinaryMerkle,
            root: bytes32(uint256(1)),
            data: abi.encode(bytes("mock tx"), siblings)
        });
        continuity = BlockProverTypes.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(2)),
            roots: new bytes32[](0)
        });
    }

    function validFactoryProof()
        private
        pure
        returns (
            BlockProverTypes.InclusionProof memory inclusion,
            BlockProverTypes.ContinuityProof memory continuity
        )
    {
        BlockProverTypes.MerkleProofEntry[] memory siblings = new BlockProverTypes.MerkleProofEntry[](0);
        inclusion = BlockProverTypes.InclusionProof({
            kind: BlockProverTypes.ProofKind.BinaryMerkle,
            root: bytes32(uint256(3)),
            data: abi.encode(bytes("mock factory tx"), siblings)
        });
        continuity = BlockProverTypes.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(4)),
            roots: new bytes32[](0)
        });
    }

    function validReleaseProof()
        private
        pure
        returns (
            BlockProverTypes.InclusionProof memory inclusion,
            BlockProverTypes.ContinuityProof memory continuity
        )
    {
        BlockProverTypes.MerkleProofEntry[] memory siblings = new BlockProverTypes.MerkleProofEntry[](0);
        inclusion = BlockProverTypes.InclusionProof({
            kind: BlockProverTypes.ProofKind.BinaryMerkle,
            root: bytes32(uint256(7)),
            data: abi.encode(bytes("mock release tx"), siblings)
        });
        continuity = BlockProverTypes.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(8)),
            roots: new bytes32[](0)
        });
    }

    function alternateFactoryProof()
        private
        pure
        returns (
            BlockProverTypes.InclusionProof memory inclusion,
            BlockProverTypes.ContinuityProof memory continuity
        )
    {
        BlockProverTypes.MerkleProofEntry[] memory siblings = new BlockProverTypes.MerkleProofEntry[](0);
        inclusion = BlockProverTypes.InclusionProof({
            kind: BlockProverTypes.ProofKind.BinaryMerkle,
            root: bytes32(uint256(5)),
            data: abi.encode(bytes("alternate factory tx"), siblings)
        });
        continuity = BlockProverTypes.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(6)),
            roots: new bytes32[](0)
        });
    }
}
