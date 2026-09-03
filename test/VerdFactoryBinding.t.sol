// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../contracts/creditcoin/Verd.sol";
import "../contracts/ethereum/ReserveLockerFactory.sol";
import "@gluwa/usc-contracts/contracts/write-ability/abstract/IUSCProofVerifier.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/BlockProverTypes.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

interface VmVerdFactoryBinding {
    function deal(address account, uint256 newBalance) external;
    function expectRevert() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function prank(address sender) external;
}

contract FactoryBindingProofVerifier is IUSCProofVerifier {
    bytes private _encodedTransaction;

    function setEncodedTransaction(bytes calldata encodedTransaction_) external {
        _encodedTransaction = encodedTransaction_;
    }

    function verifyProofs(
        bytes32,
        uint64,
        BlockProverTypes.InclusionProof calldata,
        BlockProverTypes.ContinuityProof calldata
    ) external view override returns (bytes memory encodedTransaction) {
        return _encodedTransaction;
    }

    function calculateTxIndex(
        BlockProverTypes.InclusionProof calldata
    ) external pure override returns (uint64) {
        return 0;
    }
}

contract ReserveLockerFactoryTest {
    VmVerdFactoryBinding private constant vm =
        VmVerdFactoryBinding(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant BORROWER = address(0x2222);
    address private constant AAVE_POOL = address(0x3333);
    address private constant RESERVE_ASSET = address(0x4444);
    address private constant ATOKEN = address(0x5555);
    bytes32 private constant FACILITY_ID = keccak256("factory-facility");

    function test_factoryCreatesConfiguredLockerOnce() public {
        ReserveLockerFactory factory = new ReserveLockerFactory(AAVE_POOL, RESERVE_ASSET, ATOKEN);
        uint64 unlockTime = uint64(block.timestamp + 30 days);

        vm.prank(BORROWER);
        address lockerAddress = factory.createReserveLocker(FACILITY_ID, BORROWER, unlockTime);

        require(factory.facilityLocker(FACILITY_ID) == lockerAddress, "factory binding");
        ReserveLocker locker = ReserveLocker(lockerAddress);
        require(locker.borrower() == BORROWER, "borrower");
        require(locker.aavePool() == AAVE_POOL, "pool");
        require(locker.reserveAsset() == RESERVE_ASSET, "reserve");
        require(locker.aToken() == ATOKEN, "aToken");
        require(locker.unlockTime() == unlockTime, "unlock");

        vm.expectRevert(
            abi.encodeWithSelector(ReserveLockerFactory.FacilityAlreadyCreated.selector, FACILITY_ID)
        );
        vm.prank(BORROWER);
        factory.createReserveLocker(FACILITY_ID, BORROWER, unlockTime);
    }

    function test_factoryRejectsCreationByAnotherCaller() public {
        ReserveLockerFactory factory = new ReserveLockerFactory(AAVE_POOL, RESERVE_ASSET, ATOKEN);

        vm.expectRevert(ReserveLockerFactory.OnlyBorrower.selector);
        factory.createReserveLocker(FACILITY_ID, BORROWER, uint64(block.timestamp + 30 days));
    }
}

contract VerdFactoryBindingTest {
    VmVerdFactoryBinding private constant vm =
        VmVerdFactoryBinding(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant LENDER = address(0x1111);
    address private constant BORROWER = address(0x2222);
    address private constant FACTORY = address(0x6666);
    address private constant LOCKER = address(0x7777);
    address private constant AAVE_POOL = address(0x3333);
    address private constant RESERVE_ASSET = address(0x4444);
    address private constant ATOKEN = address(0x5555);
    bytes32 private constant FACILITY_ID = keccak256("factory-binding-facility");
    uint64 private constant SOURCE_BLOCK = 12_345;
    uint256 private constant PRINCIPAL = 10 ether;
    uint256 private constant REQUIRED_RESERVE = 1 ether;

    FactoryBindingProofVerifier private verifier;
    Verd private verd;
    uint64 private maturity;
    uint64 private qualificationDeadline;

    function setUp() public {
        vm.deal(LENDER, 100 ether);
        maturity = uint64(block.timestamp + 30 days);
        qualificationDeadline = uint64(block.timestamp + 7 days);
        verifier = new FactoryBindingProofVerifier();
        verd = new Verd(address(verifier), FACTORY, AAVE_POOL, RESERVE_ASSET, ATOKEN);
    }

    function test_authenticatedFactoryEventBindsLockerToOneFacility() public {
        createFacility();
        verifier.setEncodedTransaction(validFactoryTransaction(maturity));
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) =
            validProof();
        bytes32 expectedProofId = verd.proofId(1, SOURCE_BLOCK, inclusion, continuity);

        bytes32 actualProofId = verd.bindReserveLocker(
            FACILITY_ID,
            1,
            SOURCE_BLOCK,
            inclusion,
            continuity
        );

        require(actualProofId == expectedProofId, "binding proof id");
        (, , , , , , , , , , , address boundLocker) = verd.getFacility(FACILITY_ID);
        require(boundLocker == LOCKER, "locker not bound");
        require(verd.lockerFacility(LOCKER) == FACILITY_ID, "locker index");
        (bytes32 bindingProofId, uint64 bindingBlock, uint64 unlockTime) =
            verd.getFacilityLockerBinding(FACILITY_ID);
        require(bindingProofId == expectedProofId, "binding evidence");
        require(bindingBlock == SOURCE_BLOCK, "binding block");
        require(unlockTime == maturity, "binding maturity");

        vm.expectRevert(abi.encodeWithSelector(Verd.LockerAlreadyBound.selector, LOCKER));
        verd.bindReserveLocker(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_rejectsFactoryEventFromAnotherEmitter() public {
        createFacility();
        verifier.setEncodedTransaction(validFactoryTransaction(maturity));
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) =
            validProof();
        verifier.setEncodedTransaction(
            encodedFactoryTransaction(
                BORROWER,
                FACTORY,
                address(0xABCD),
                FACILITY_ID,
                LOCKER,
                BORROWER,
                maturity
            )
        );

        vm.expectRevert(Verd.FactoryEventMissing.selector);
        verd.bindReserveLocker(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_rejectsFactoryEventForAnotherFacility() public {
        createFacility();
        verifier.setEncodedTransaction(
            encodedFactoryTransaction(
                BORROWER,
                FACTORY,
                FACTORY,
                keccak256("other-facility"),
                LOCKER,
                BORROWER,
                maturity
            )
        );
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) =
            validProof();

        vm.expectRevert(Verd.FactoryFacilityMismatch.selector);
        verd.bindReserveLocker(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_rejectsLockerUnlockBeforeFacilityMaturity() public {
        createFacility();
        verifier.setEncodedTransaction(
            encodedFactoryTransaction(
                BORROWER,
                FACTORY,
                FACTORY,
                FACILITY_ID,
                LOCKER,
                BORROWER,
                maturity - 1
            )
        );
        (BlockProverTypes.InclusionProof memory inclusion, BlockProverTypes.ContinuityProof memory continuity) =
            validProof();

        vm.expectRevert(Verd.LockerMaturityMismatch.selector);
        verd.bindReserveLocker(FACILITY_ID, 1, SOURCE_BLOCK, inclusion, continuity);
    }

    function test_rejectsLockerAlreadyBoundToAnotherFacility() public {
        createFacility();
        verifier.setEncodedTransaction(validFactoryTransaction(maturity));
        (BlockProverTypes.InclusionProof memory firstInclusion, BlockProverTypes.ContinuityProof memory firstContinuity) =
            validProof();
        verd.bindReserveLocker(FACILITY_ID, 1, SOURCE_BLOCK, firstInclusion, firstContinuity);

        bytes32 secondFacilityId = keccak256("factory-binding-facility-2");
        vm.prank(LENDER);
        verd.createFacility(
            secondFacilityId,
            BORROWER,
            PRINCIPAL,
            1_000,
            500,
            maturity,
            qualificationDeadline,
            REQUIRED_RESERVE
        );
        verifier.setEncodedTransaction(
            encodedFactoryTransaction(
                BORROWER,
                FACTORY,
                FACTORY,
                secondFacilityId,
                LOCKER,
                BORROWER,
                maturity
            )
        );
        (BlockProverTypes.InclusionProof memory secondInclusion, BlockProverTypes.ContinuityProof memory secondContinuity) =
            alternateProof();

        vm.expectRevert(abi.encodeWithSelector(Verd.LockerAlreadyBound.selector, LOCKER));
        verd.bindReserveLocker(secondFacilityId, 1, SOURCE_BLOCK + 1, secondInclusion, secondContinuity);
    }

    function createFacility() private {
        vm.prank(LENDER);
        verd.createFacility(
            FACILITY_ID,
            BORROWER,
            PRINCIPAL,
            1_000,
            500,
            maturity,
            qualificationDeadline,
            REQUIRED_RESERVE
        );
    }

    function validFactoryTransaction(uint64 unlockTime) private pure returns (bytes memory) {
        return encodedFactoryTransaction(
            BORROWER,
            FACTORY,
            FACTORY,
            FACILITY_ID,
            LOCKER,
            BORROWER,
            unlockTime
        );
    }

    function encodedFactoryTransaction(
        address txFrom,
        address txTo,
        address eventEmitter,
        bytes32 eventFacilityId,
        address locker,
        address eventBorrower,
        uint64 unlockTime
    ) private pure returns (bytes memory encoded) {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256(
            "ReserveLockerCreated(bytes32,address,address,address,address,address,uint64)"
        );
        topics[1] = eventFacilityId;
        topics[2] = bytes32(uint256(uint160(locker)));
        topics[3] = bytes32(uint256(uint160(eventBorrower)));

        EvmV1Decoder.LogEntryTuple[] memory logs = new EvmV1Decoder.LogEntryTuple[](1);
        logs[0] = EvmV1Decoder.LogEntryTuple({
            address_: eventEmitter,
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

    function alternateProof()
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
            data: abi.encode(bytes("alternate factory tx"), siblings)
        });
        continuity = BlockProverTypes.ContinuityProof({
            lowerEndpointDigest: bytes32(uint256(4)),
            roots: new bytes32[](0)
        });
    }
}
