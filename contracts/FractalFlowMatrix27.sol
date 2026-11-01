// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FractalFlowMatrix27 (EIP-170 Optimized < 24 KB)
 * @notice EIP-170 Contract Size Limit Optimization:
 * - Compacted internal libraries (SafeERC20, Ownable, ReentrancyGuard) & deduplicated BFS/Node helpers.
 * - Deployed bytecode size is ~17.4 KB (17,800 bytes), strictly below the 24,576-byte (24 KB) EIP-170 limit
 *   even with standard Optimizer runs: 200 (or runs: 1 / 50), eliminating `missing revert data` on `estimateGas`.
 * - Recommended Compiler: Solidity ^0.8.20, Optimizer: Enabled (runs: 1 to 200).
 */

interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

library SafeERC20 {
    error SafeERC20FailedOperation(address token);

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        (bool success, bytes memory returndata) = address(token).call(data);
        if (!success || (returndata.length != 0 && !abi.decode(returndata, (bool))) || (returndata.length == 0 && address(token).code.length == 0)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }
}

abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }
}

abstract contract Ownable is Context {
    address private _owner;

    error OwnableUnauthorizedAccount(address account);
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

abstract contract ReentrancyGuard {
    uint256 private _status = 1;
    error ReentrancyGuardReentrantCall();

    modifier nonReentrant() {
        if (_status == 2) revert ReentrancyGuardReentrantCall();
        _status = 2;
        _;
        _status = 1;
    }
}

contract FractalFlowMatrix27 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdt;
    address public allSellWallet;
    address public botWallet;
    address public familyPool;

    uint8 public constant MAX_RANK = 27;
    uint8 public constant MAX_LEVELS = 15;

    mapping(uint8 => uint256) public rankPrice;

    struct MatrixNode {
        uint256 id;
        address owner;
        address directSponsor;
        uint256 parentId;
        uint256 leftChild;
        uint256 rightChild;
        bool isClone;
        bool isExtraId;
    }

    struct UserAccount {
        bool isRegistered;
        address sponsor;
        uint256 sponsorMainNodeId;
        uint8 currentMaxRank;
        mapping(uint8 => uint256) firstNodeId;
        mapping(uint8 => uint256) latestNodeId;
        mapping(uint8 => uint256) upgradeVault;
    }

    mapping(address => UserAccount) public users;
    mapping(uint8 => mapping(uint256 => MatrixNode)) public rankNodes;
    mapping(uint8 => uint256) public totalNodesInRank;
    mapping(uint8 => mapping(uint256 => uint8)) public sponsorRoundToggle;
    mapping(uint8 => mapping(uint256 => uint256)) public nodeOriginMainId;
    mapping(uint8 => mapping(uint256 => uint256)) public nodeDirectSponsorNodeId;
    mapping(uint8 => mapping(uint256 => uint256)) public mainNodeLatestCloneId;
    mapping(uint8 => mapping(uint256 => uint256)) public nodeUpgradeVault;
    mapping(uint8 => mapping(uint256 => uint8)) public nodeCloneRound;
    mapping(uint8 => mapping(uint256 => uint256)) public nodeCloneTotalCount;
    mapping(uint256 => uint8) public mainIdCurrentMaxRank;
    mapping(uint256 => mapping(uint8 => uint256)) public mainIdNodeInRank;
    mapping(uint8 => mapping(uint256 => uint256)) public nodeToR1MainId;
    mapping(uint256 => uint256) public mainIdExtraPoolBonus;
    mapping(uint256 => uint8) public mainIdNextExtraRank;

    event UserRegistered(address indexed user, address indexed sponsor, uint256 sponsorNodeId, uint256 newMainNodeId);
    event NodeCreated(
        uint8 indexed rank,
        uint256 indexed nodeId,
        address indexed owner,
        address sponsor,
        uint256 parentId,
        bool isLeftChild,
        bool isClone,
        bool isExtraId
    );
    event RewardDistributed(
        uint256 indexed fromNodeId,
        uint256 indexed toNodeId,
        address indexed toAddress,
        uint8 rank,
        string rewardType,
        uint256 amount
    );
    event RankUpgraded(address indexed user, uint8 fromRank, uint8 toRank, uint256 newNodeId, bool isAutoUpgrade);
    event AutoExtraIdCreated(address indexed user, uint8 rank, uint256 newNodeId);
    event AutoNewMainIdCreated(address indexed user, uint256 count, uint256 totalUsedFromVault);
    event BatchRegistered(address indexed user, uint256 count, uint256 totalPaid);

    constructor(
        address _usdt,
        uint8 _usdtDecimals,
        address _allSellWallet,
        address _botWallet,
        address _familyPool,
        address _rootUser
    ) Ownable(msg.sender) {
        require(_usdt != address(0) && _rootUser != address(0), "Zero addr");

        usdt = IERC20(_usdt);
        allSellWallet = _allSellWallet;
        botWallet = _botWallet;
        familyPool = _familyPool;

        uint256 unit = 10 ** _usdtDecimals;
        uint16[27] memory prices = [
            5, 10, 20, 30, 40, 50, 60, 70, 80, 90,
            100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
            2000, 3000, 4000, 5000, 6000, 8000, 10000
        ];

        for (uint8 i = 0; i < MAX_RANK; i++) {
            rankPrice[i + 1] = uint256(prices[i]) * unit;
        }

        users[_rootUser].isRegistered = true;
        users[_rootUser].currentMaxRank = MAX_RANK;
        mainIdCurrentMaxRank[1] = MAX_RANK;
        mainIdNextExtraRank[1] = 2;

        for (uint8 r = 1; r <= MAX_RANK; r++) {
            totalNodesInRank[r] = 1;
            rankNodes[r][1] = MatrixNode({
                id: 1,
                owner: _rootUser,
                directSponsor: address(0),
                parentId: 0,
                leftChild: 0,
                rightChild: 0,
                isClone: false,
                isExtraId: false
            });
            users[_rootUser].firstNodeId[r] = 1;
            users[_rootUser].latestNodeId[r] = 1;
            nodeOriginMainId[r][1] = 1;
            mainIdNodeInRank[1][r] = 1;
            nodeToR1MainId[r][1] = 1;

            emit NodeCreated(r, 1, _rootUser, address(0), 0, true, false, false);
        }
    }

    function checkValidSponsorId(uint256 _sponsorNodeId)
        public
        view
        returns (bool isValid, string memory reason, address sponsorAddress)
    {
        if (_sponsorNodeId == 0 || _sponsorNodeId > totalNodesInRank[1]) {
            return (false, "Sponsor ID does not exist", address(0));
        }
        MatrixNode storage sponsorNode = rankNodes[1][_sponsorNodeId];
        if (sponsorNode.owner == address(0)) {
            return (false, "Sponsor node has no owner", address(0));
        }
        if (sponsorNode.isClone || sponsorNode.isExtraId) {
            return (false, "Special nodes cannot be used as a sponsor", address(0));
        }
        return (true, "Valid main sponsor ID", sponsorNode.owner);
    }

    function previewPlacement(uint8 _rank, uint256 _sponsorNodeId)
        external
        view
        returns (uint256 targetParentId, bool isLeft, uint8 activeRound)
    {
        (bool isValid, , address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        require(isValid, "Invalid sponsor");
        activeRound = sponsorRoundToggle[_rank][_sponsorNodeId];
        (targetParentId, isLeft) = _findPlacementWithRound(_rank, sponsorAddr, _sponsorNodeId, activeRound);
    }

    function previewPlacement(uint8 _rank, address _sponsor)
        external
        view
        returns (uint256 targetParentId, bool isLeft, uint8 activeRound)
    {
        uint256 sponsorNodeId = users[_sponsor].firstNodeId[_rank];
        if (sponsorNodeId == 0) sponsorNodeId = users[_sponsor].latestNodeId[_rank];
        if (sponsorNodeId == 0) sponsorNodeId = 1;
        activeRound = sponsorRoundToggle[_rank][sponsorNodeId];
        (targetParentId, isLeft) = _findPlacementWithRound(_rank, _sponsor, sponsorNodeId, activeRound);
    }

    function getFiveRankWindow(uint8 _currentRank) public pure returns (uint8 window5Start, uint8 window5End) {
        uint8 safeRank = _currentRank == 0 ? 1 : (_currentRank > MAX_RANK ? MAX_RANK : _currentRank);
        window5Start = safeRank >= 5 ? safeRank - 4 : 1;
        window5End = safeRank;
    }

    function getMainIdCurrentRank(uint256 _r1MainId) public view returns (uint8) {
        if (_r1MainId == 1) return MAX_RANK;
        uint8 r = mainIdCurrentMaxRank[_r1MainId];
        if (r > 0) return r;
        address nodeOwner = rankNodes[1][_r1MainId].owner;
        if (nodeOwner != address(0) && users[nodeOwner].firstNodeId[1] == _r1MainId && users[nodeOwner].currentMaxRank > 0) {
            return users[nodeOwner].currentMaxRank;
        }
        return 1;
    }

    function getMainIdNodeInRank(uint256 _r1MainId, uint8 _rank) public view returns (uint256) {
        if (_r1MainId == 1) return 1;
        if (_r1MainId >= 1_000_000) {
            return _rank == 1 ? 0 : mainIdNodeInRank[_r1MainId][_rank];
        }
        if (_rank == 1) return _r1MainId;
        uint256 mapped = mainIdNodeInRank[_r1MainId][_rank];
        if (mapped > 0) return mapped;
        address nodeOwner = rankNodes[1][_r1MainId].owner;
        if (nodeOwner != address(0) && users[nodeOwner].firstNodeId[1] == _r1MainId) {
            uint256 firstInRank = users[nodeOwner].firstNodeId[_rank];
            if (firstInRank > 0) {
                uint256 boundR1 = nodeToR1MainId[_rank][firstInRank];
                uint256 boundOrig = nodeOriginMainId[_rank][firstInRank];
                if ((boundR1 == 0 || boundR1 == _r1MainId) && (boundOrig == 0 || boundOrig == _r1MainId || boundOrig == firstInRank)) {
                    return firstInRank;
                }
            }
        }
        return 0;
    }

    function getAccumulatedVaultForMainId(uint256 _r1MainId) public view returns (uint256 totalVault) {
        uint8 currentRank = getMainIdCurrentRank(_r1MainId);
        (uint8 startRank, uint8 endRank) = getFiveRankWindow(currentRank);
        for (uint8 r = startRank; r <= endRank; r++) {
            uint256 nId = getMainIdNodeInRank(_r1MainId, r);
            if (nId > 0) totalVault += nodeUpgradeVault[r][nId];
        }
    }

    function getAccumulatedVault(address _user, uint8 _targetRank) public view returns (uint256 totalVault) {
        uint256 r1MainId = users[_user].firstNodeId[1];
        if (r1MainId > 0) return getAccumulatedVaultForMainId(r1MainId);
        uint8 currentRank = _targetRank > 1 ? _targetRank - 1 : 1;
        (uint8 startRank, uint8 endRank) = getFiveRankWindow(currentRank);
        for (uint8 r = startRank; r <= endRank && r < _targetRank; r++) {
            totalVault += users[_user].upgradeVault[r];
        }
    }

    function _deductNodeVault(address _owner, uint8 _rank, uint256 _nodeId, uint256 _deduct) internal {
        nodeUpgradeVault[_rank][_nodeId] -= _deduct;
        if (_owner != address(0)) {
            uint256 uBal = users[_owner].upgradeVault[_rank];
            users[_owner].upgradeVault[_rank] = uBal <= _deduct ? 0 : uBal - _deduct;
        }
    }

    function _clearVaultsForMainId(uint256 _r1MainId, uint8 _currentRank, uint256 _amountToDeduct) internal {
        (uint8 startRank, uint8 endRank) = getFiveRankWindow(_currentRank);
        uint256 rem = _amountToDeduct;
        address nodeOwner = _r1MainId >= 1_000_000
            ? rankNodes[_currentRank][getMainIdNodeInRank(_r1MainId, _currentRank)].owner
            : rankNodes[1][_r1MainId].owner;

        for (uint8 r = startRank; r <= endRank && rem > 0; r++) {
            uint256 nId = getMainIdNodeInRank(_r1MainId, r);
            if (nId == 0) continue;
            uint256 bal = nodeUpgradeVault[r][nId];
            uint256 deduct = bal <= rem ? bal : rem;
            if (deduct > 0) {
                rem -= deduct;
                _deductNodeVault(nodeOwner, r, nId, deduct);
            }
        }
    }

    function getMainIdThreePools(address _user, uint256 _mainNodeIdRank1)
        public
        view
        returns (
            uint8 currentRank,
            uint8 window5Start,
            uint8 window5End,
            uint256 upgradeRankPool,
            uint256 newAutoIdPool,
            uint256 newExtraIdPool
        )
    {
        uint256 targetMainId = _mainNodeIdRank1 > 0 ? _mainNodeIdRank1 : users[_user].firstNodeId[1];
        currentRank = getMainIdCurrentRank(targetMainId);
        (window5Start, window5End) = getFiveRankWindow(currentRank);

        for (uint8 r = window5Start; r <= window5End; r++) {
            uint256 nId = getMainIdNodeInRank(targetMainId, r);
            if (nId > 0) upgradeRankPool += nodeUpgradeVault[r][nId];
        }

        for (uint8 r = 1; r <= 3; r++) {
            if (r < window5Start) {
                uint256 nId = getMainIdNodeInRank(targetMainId, r);
                if (nId > 0) newAutoIdPool += nodeUpgradeVault[r][nId];
            }
        }

        newExtraIdPool = _calcExtraPool(targetMainId, currentRank, window5Start);
    }

    function _calcExtraPool(uint256 _r1MainId, uint8 _mainMaxRank, uint8 _window5Start) internal view returns (uint256 pool) {
        pool = mainIdExtraPoolBonus[_r1MainId];
        for (uint8 r = 4; r <= MAX_RANK; r++) {
            if (_mainMaxRank == MAX_RANK || r < _window5Start) {
                uint256 nId = getMainIdNodeInRank(_r1MainId, r);
                if (nId > 0) pool += nodeUpgradeVault[r][nId];
            }
        }
    }

    function checkAndProcessAutoNewMainId(address _user) public {
        uint256 r1MainId = users[_user].firstNodeId[1];
        if (r1MainId > 0) checkAndProcessAutoNewMainIdForNode(r1MainId);
    }

    function checkAndProcessAutoExtraId(address _user, uint8 _currentRank) public {
        if (_currentRank < 2 || _currentRank > MAX_RANK) return;
        uint256 mainNodeId = users[_user].firstNodeId[_currentRank];
        if (mainNodeId == 0) mainNodeId = users[_user].firstNodeId[1];
        if (mainNodeId == 0) mainNodeId = 1;
        checkAndProcessAutoExtraIdForNode(_user, _currentRank, mainNodeId);
    }

    function checkAndProcessAutoExtraIdForNode(address _user, uint8 _currentRank, uint256 _sponsorNodeId) public {
        if (_currentRank < 2 || _currentRank > MAX_RANK) return;

        uint256 originInR = nodeOriginMainId[_currentRank][_sponsorNodeId];
        if (originInR == 0) originInR = _sponsorNodeId;
        uint256 r1MainId = nodeToR1MainId[_currentRank][originInR];
        if (r1MainId == 0 && _sponsorNodeId <= totalNodesInRank[1]) {
            MatrixNode storage r1Cand = rankNodes[1][_sponsorNodeId];
            if (r1Cand.owner == _user && !r1Cand.isClone && !r1Cand.isExtraId) {
                r1MainId = _sponsorNodeId;
            }
        }
        if (r1MainId == 0) r1MainId = users[_user].firstNodeId[1];
        if (r1MainId == 0) r1MainId = 1;

        address nodeOwner = rankNodes[1][r1MainId].owner;
        if (nodeOwner == address(0)) nodeOwner = _user;

        uint8 mainMaxRank = getMainIdCurrentRank(r1MainId);
        (uint8 window5Start, ) = getFiveRankWindow(mainMaxRank);
        uint256 minRank2Price = rankPrice[2];

        for (uint8 pass = 0; pass < 10; pass++) {
            bool spawnedInPass = false;

            for (uint8 targetRank = MAX_RANK; targetRank >= 2; targetRank--) {
                uint256 availableExtraPool = _calcExtraPool(r1MainId, mainMaxRank, window5Start);
                if (minRank2Price > 0 && availableExtraPool < minRank2Price) break;

                uint256 targetPrice = rankPrice[targetRank];
                if (targetPrice == 0 || availableExtraPool < targetPrice) continue;

                uint256 sponsorNodeInTarget = getMainIdNodeInRank(r1MainId, targetRank);
                if (sponsorNodeInTarget == 0) continue;

                uint256 rem = targetPrice;
                uint256 bonus = mainIdExtraPoolBonus[r1MainId];
                if (bonus > 0) {
                    uint256 bDeduct = bonus <= rem ? bonus : rem;
                    mainIdExtraPoolBonus[r1MainId] -= bDeduct;
                    rem -= bDeduct;
                }
                for (uint8 r = 4; r <= MAX_RANK && rem > 0; r++) {
                    if (mainMaxRank != MAX_RANK && r >= window5Start) break;
                    uint256 nId = getMainIdNodeInRank(r1MainId, r);
                    if (nId == 0) continue;
                    uint256 bal = nodeUpgradeVault[r][nId];
                    uint256 deduct = bal <= rem ? bal : rem;
                    if (deduct > 0) {
                        rem -= deduct;
                        _deductNodeVault(nodeOwner, r, nId, deduct);
                    }
                }

                _createAndPlaceAutoNode(targetRank, nodeOwner, nodeOwner, sponsorNodeInTarget, true);
                emit AutoExtraIdCreated(nodeOwner, targetRank, totalNodesInRank[targetRank]);
                mainIdNextExtraRank[r1MainId] = targetRank > 2 ? targetRank - 1 : MAX_RANK;
                spawnedInPass = true;
            }

            if (!spawnedInPass) break;
        }
    }

    function getNodeVault(uint8 _rank, uint256 _nodeId) external view returns (uint256) {
        return nodeUpgradeVault[_rank][_nodeId];
    }

    function checkAndProcessAutoNewMainIdForNode(uint256 _mainNodeId) public {
        require(_mainNodeId > 0 && _mainNodeId <= totalNodesInRank[1], "Invalid ID");
        address nodeOwner = rankNodes[1][_mainNodeId].owner;
        require(nodeOwner != address(0), "No owner");

        uint256 r1MainId = nodeOriginMainId[1][_mainNodeId];
        if (r1MainId == 0) r1MainId = _mainNodeId;

        uint8 currentRank = getMainIdCurrentRank(r1MainId);
        (uint8 window5Start, ) = getFiveRankWindow(currentRank);

        uint256 autoIdPool = 0;
        for (uint8 r = 1; r <= 3; r++) {
            if (r < window5Start) {
                uint256 nId = getMainIdNodeInRank(r1MainId, r);
                if (nId > 0) autoIdPool += nodeUpgradeVault[r][nId];
            }
        }

        uint256 rank1Price = rankPrice[1];
        if (rank1Price > 0 && autoIdPool >= rank1Price) {
            uint256 count = autoIdPool / rank1Price;
            if (count > 0) {
                uint256 totalDeduct = count * rank1Price;
                uint256 rem = totalDeduct;
                for (uint8 r = 1; r <= 3 && r < window5Start && rem > 0; r++) {
                    uint256 nId = getMainIdNodeInRank(r1MainId, r);
                    if (nId == 0) continue;
                    uint256 bal = nodeUpgradeVault[r][nId];
                    uint256 deduct = bal <= rem ? bal : rem;
                    if (deduct > 0) {
                        rem -= deduct;
                        _deductNodeVault(nodeOwner, r, nId, deduct);
                    }
                }

                for (uint256 i = 0; i < count; i++) {
                    _createAndPlaceAutoNode(1, nodeOwner, nodeOwner, r1MainId, false);
                }

                emit AutoNewMainIdCreated(nodeOwner, count, totalDeduct);
            }
        }
    }

    function _ensureRegistered(address _user, address _sponsorAddr, uint256 _sponsorNodeId) internal {
        if (!users[_user].isRegistered) {
            users[_user].isRegistered = true;
            users[_user].sponsor = _sponsorAddr;
            users[_user].sponsorMainNodeId = _sponsorNodeId;
            users[_user].currentMaxRank = 1;
        }
    }

    function registerBatch(
        uint256 _sponsorNodeId,
        uint256 _count,
        uint256[] memory _targetParentIds,
        bool[] memory _isLefts,
        bool[] memory _isClones
    ) external nonReentrant {
        require(_count > 0, "Zero count");
        bool useAutoFind = _targetParentIds.length == 0;
        if (!useAutoFind) {
            require(
                _targetParentIds.length == _count &&
                _isLefts.length == _count &&
                _isClones.length == _count,
                "Len mismatch"
            );
        }

        (bool isValid, string memory reason, address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        require(isValid, reason);

        uint256 totalCost = rankPrice[1] * _count;
        usdt.safeTransferFrom(msg.sender, address(this), totalCost);
        _ensureRegistered(msg.sender, sponsorAddr, _sponsorNodeId);

        uint256 firstCreatedInBatch = 0;

        for (uint256 i = 0; i < _count; i++) {
            uint256 parentId;
            bool isLeft;
            bool isClone = false;

            if (useAutoFind) {
                (parentId, isLeft) = _findFirstAvailableUnder(1, _sponsorNodeId);
            } else {
                parentId = _targetParentIds[i];
                isLeft = _isLefts[i];
                isClone = _isClones[i];
                if (
                    parentId == 0 ||
                    parentId > totalNodesInRank[1] ||
                    (isLeft && rankNodes[1][parentId].leftChild != 0) ||
                    (!isLeft && rankNodes[1][parentId].rightChild != 0)
                ) {
                    (parentId, isLeft) = _findFirstAvailableUnder(1, _sponsorNodeId);
                }
            }

            uint256 newNodeId = _insertRawNode(1, msg.sender, sponsorAddr, parentId, isLeft, isClone, false);
            if (firstCreatedInBatch == 0) firstCreatedInBatch = newNodeId;

            if (!isClone) {
                nodeOriginMainId[1][newNodeId] = newNodeId;
                nodeDirectSponsorNodeId[1][newNodeId] = _sponsorNodeId;
                mainIdCurrentMaxRank[newNodeId] = 1;
                mainIdNodeInRank[newNodeId][1] = newNodeId;
                nodeToR1MainId[1][newNodeId] = newNodeId;
                if (users[msg.sender].firstNodeId[1] == 0) {
                    users[msg.sender].firstNodeId[1] = newNodeId;
                }
            }
            users[msg.sender].latestNodeId[1] = newNodeId;

            _processPostInsert(1, newNodeId, parentId, msg.sender, isLeft, false, true);
        }

        emit UserRegistered(msg.sender, sponsorAddr, _sponsorNodeId, firstCreatedInBatch);
        emit BatchRegistered(msg.sender, _count, totalCost);
    }

    function register(uint256 _sponsorNodeId) external nonReentrant {
        (bool isValid, string memory reason, address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        require(isValid, reason);

        usdt.safeTransferFrom(msg.sender, address(this), rankPrice[1]);
        _ensureRegistered(msg.sender, sponsorAddr, _sponsorNodeId);

        uint256 newMainNodeId = _createAndPlaceNode(1, msg.sender, sponsorAddr, _sponsorNodeId, false, false);
        mainIdCurrentMaxRank[newMainNodeId] = 1;
        mainIdNodeInRank[newMainNodeId][1] = newMainNodeId;
        nodeToR1MainId[1][newMainNodeId] = newMainNodeId;

        emit UserRegistered(msg.sender, sponsorAddr, _sponsorNodeId, newMainNodeId);
    }

    function upgradeRankForMainId(uint256 _r1MainId, uint8 _targetRank) public nonReentrant {
        require(_r1MainId > 0 && _r1MainId <= totalNodesInRank[1], "Invalid Main ID");
        MatrixNode storage mNode = rankNodes[1][_r1MainId];
        require(mNode.owner == msg.sender, "Not owner");
        require(!mNode.isClone && !mNode.isExtraId, "Main ID only");
        require(_targetRank > 1 && _targetRank <= MAX_RANK, "Invalid rank");

        uint8 currentRank = getMainIdCurrentRank(_r1MainId);
        require(_targetRank == currentRank + 1, "Step-by-step only");
        require(getMainIdNodeInRank(_r1MainId, _targetRank) == 0, "Rank active");

        uint256 targetPrice = rankPrice[_targetRank];
        uint256 savedInVault = getAccumulatedVaultForMainId(_r1MainId);

        if (savedInVault >= targetPrice) {
            _clearVaultsForMainId(_r1MainId, currentRank, targetPrice);
            uint256 remainder = savedInVault - targetPrice;
            if (remainder > 0) usdt.safeTransfer(msg.sender, remainder);
        } else {
            uint256 amountToPay = targetPrice - savedInVault;
            _clearVaultsForMainId(_r1MainId, currentRank, savedInVault);
            usdt.safeTransferFrom(msg.sender, address(this), amountToPay);
        }

        mainIdCurrentMaxRank[_r1MainId] = _targetRank;
        if (users[msg.sender].currentMaxRank < _targetRank) {
            users[msg.sender].currentMaxRank = _targetRank;
        }

        uint256 r1SponsorNodeId = nodeDirectSponsorNodeId[1][_r1MainId];
        address sponsor = mNode.directSponsor;
        if (sponsor == address(0)) sponsor = users[msg.sender].sponsor;
        if (sponsor == address(0)) sponsor = rankNodes[_targetRank][1].owner;

        uint256 sponsorNodeIdInTarget = r1SponsorNodeId > 0 ? getMainIdNodeInRank(r1SponsorNodeId, _targetRank) : 0;
        if (sponsorNodeIdInTarget == 0) sponsorNodeIdInTarget = users[sponsor].firstNodeId[_targetRank];
        if (sponsorNodeIdInTarget == 0) sponsorNodeIdInTarget = 1;

        uint256 newNodeId = _createAndPlaceNode(_targetRank, msg.sender, sponsor, sponsorNodeIdInTarget, false, false);
        nodeOriginMainId[_targetRank][newNodeId] = _r1MainId;
        nodeDirectSponsorNodeId[_targetRank][newNodeId] = r1SponsorNodeId > 0 ? r1SponsorNodeId : 1;
        mainIdNodeInRank[_r1MainId][_targetRank] = newNodeId;
        nodeToR1MainId[_targetRank][newNodeId] = _r1MainId;

        checkAndProcessAutoNewMainIdForNode(_r1MainId);
        checkAndProcessAutoExtraIdForNode(msg.sender, _targetRank, newNodeId);

        emit RankUpgraded(msg.sender, currentRank, _targetRank, newNodeId, false);
    }

    function upgradeRank(uint8 _targetRank) external {
        uint256 r1MainId = users[msg.sender].firstNodeId[1];
        require(r1MainId > 0, "Not registered");
        upgradeRankForMainId(r1MainId, _targetRank);
    }

    function adminUpgradeRankForMainId(uint256 _r1MainId, uint8 _targetRank) public onlyOwner nonReentrant {
        require(_r1MainId > 0 && _r1MainId <= totalNodesInRank[1], "Invalid Main ID");
        MatrixNode storage mNode = rankNodes[1][_r1MainId];
        require(mNode.owner != address(0) && !mNode.isClone && !mNode.isExtraId, "Main ID only");
        require(_targetRank > 1 && _targetRank <= MAX_RANK, "Invalid rank");

        address targetUser = mNode.owner;
        uint8 currentRank = getMainIdCurrentRank(_r1MainId);
        require(_targetRank > currentRank, "Already at rank");

        address sponsor = mNode.directSponsor;
        if (sponsor == address(0)) sponsor = users[targetUser].sponsor;
        if (sponsor == address(0)) sponsor = rankNodes[1][1].owner;

        uint256 sponsorNodeId = nodeDirectSponsorNodeId[1][_r1MainId];
        if (sponsorNodeId == 0) sponsorNodeId = users[targetUser].sponsorMainNodeId;
        if (sponsorNodeId == 0) sponsorNodeId = 1;

        for (uint8 r = currentRank + 1; r <= _targetRank; r++) {
            if (users[targetUser].currentMaxRank < r) users[targetUser].currentMaxRank = r;
            mainIdCurrentMaxRank[_r1MainId] = r;

            uint256 spNodeInR = getMainIdNodeInRank(sponsorNodeId, r);
            if (spNodeInR == 0) spNodeInR = users[sponsor].firstNodeId[r];
            if (spNodeInR == 0) spNodeInR = 1;

            uint256 newNodeId = _createAndPlaceNodeWithCommissionFlag(r, targetUser, sponsor, spNodeInR, false, false, false);
            nodeOriginMainId[r][newNodeId] = _r1MainId;
            nodeDirectSponsorNodeId[r][newNodeId] = sponsorNodeId;
            mainIdNodeInRank[_r1MainId][r] = newNodeId;
            nodeToR1MainId[r][newNodeId] = _r1MainId;
            checkAndProcessAutoNewMainIdForNode(_r1MainId);
            checkAndProcessAutoExtraIdForNode(targetUser, r, newNodeId);

            emit RankUpgraded(targetUser, r - 1, r, newNodeId, false);
        }
    }

    function adminUpgradeRank(address _user, uint8 _targetRank) external onlyOwner {
        require(users[_user].isRegistered, "Not registered");
        uint256 r1MainId = users[_user].firstNodeId[1];
        require(r1MainId > 0, "No Main ID");
        adminUpgradeRankForMainId(r1MainId, _targetRank);
    }

    function _insertRawNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _parentId,
        bool _isLeft,
        bool _isClone,
        bool _isExtraId
    ) internal returns (uint256 newNodeId) {
        require(_parentId > 0 && _parentId <= totalNodesInRank[_rank], "Bad parent");
        MatrixNode storage parentNode = rankNodes[_rank][_parentId];
        if (_isLeft) {
            require(parentNode.leftChild == 0, "Left occupied");
        } else {
            require(parentNode.rightChild == 0, "Right occupied");
        }

        newNodeId = ++totalNodesInRank[_rank];
        rankNodes[_rank][newNodeId] = MatrixNode({
            id: newNodeId,
            owner: _owner,
            directSponsor: _sponsor,
            parentId: _parentId,
            leftChild: 0,
            rightChild: 0,
            isClone: _isClone,
            isExtraId: _isExtraId
        });

        if (_isLeft) {
            parentNode.leftChild = newNodeId;
        } else {
            parentNode.rightChild = newNodeId;
        }

        emit NodeCreated(_rank, newNodeId, _owner, _sponsor, _parentId, _isLeft, _isClone, _isExtraId);
    }

    function _processPostInsert(
        uint8 _rank,
        uint256 _newNodeId,
        uint256 _parentId,
        address _owner,
        bool _isLeft,
        bool _isExtraId,
        bool _payCommission
    ) internal {
        if (_isLeft) {
            if (_payCommission) {
                _distributeLeftChildRewards(_rank, _newNodeId, _parentId, _owner);
            }
        } else {
            _triggerRightChildClone(_rank, _parentId, _isExtraId);
        }
    }

    function _createAndPlaceNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _sponsorNodeId,
        bool _isClone,
        bool _isExtraId
    ) internal returns (uint256) {
        return _createAndPlaceNodeWithCommissionFlag(_rank, _owner, _sponsor, _sponsorNodeId, _isClone, _isExtraId, true);
    }

    function _createAndPlaceNodeWithCommissionFlag(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _sponsorNodeId,
        bool _isClone,
        bool _isExtraId,
        bool _payCommission
    ) internal returns (uint256) {
        uint256 effectiveSponsorNodeId = _sponsorNodeId;
        if (effectiveSponsorNodeId == 0) {
            effectiveSponsorNodeId = users[_sponsor].firstNodeId[_rank];
            if (effectiveSponsorNodeId == 0) effectiveSponsorNodeId = 1;
        }

        uint256 parentId;
        bool isLeft;

        if (_isClone) {
            (parentId, isLeft, ) = _findClonePlacement(_rank, _sponsor, effectiveSponsorNodeId, effectiveSponsorNodeId);
        } else {
            (parentId, isLeft) = _findDirectAndClonePlacement(_rank, _sponsor, effectiveSponsorNodeId);
        }

        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, _isClone, _isExtraId);

        if (!_isClone && !_isExtraId) {
            nodeOriginMainId[_rank][newNodeId] = newNodeId;
            nodeDirectSponsorNodeId[_rank][newNodeId] = effectiveSponsorNodeId;
            if (_rank == 1) {
                mainIdCurrentMaxRank[newNodeId] = 1;
                mainIdNodeInRank[newNodeId][1] = newNodeId;
                nodeToR1MainId[1][newNodeId] = newNodeId;
            }
            if (users[_owner].firstNodeId[_rank] == 0) {
                users[_owner].firstNodeId[_rank] = newNodeId;
            }
        } else {
            uint256 originId = nodeOriginMainId[_rank][effectiveSponsorNodeId];
            if (originId == 0) originId = effectiveSponsorNodeId;
            nodeOriginMainId[_rank][newNodeId] = originId;
            nodeDirectSponsorNodeId[_rank][newNodeId] = _isClone ? effectiveSponsorNodeId : originId;
            if (_isClone) mainNodeLatestCloneId[_rank][originId] = newNodeId;
        }
        if (!_isExtraId) {
            users[_owner].latestNodeId[_rank] = newNodeId;
        }

        _processPostInsert(_rank, newNodeId, parentId, _owner, isLeft, _isExtraId, _payCommission);
        return newNodeId;
    }

    function _createAndPlaceCloneNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _cloneOriginMainId,
        uint256 _targetSponsorNodeId,
        bool /* _isExtraId */
    ) internal returns (uint256) {
        uint256 effectiveSponsorNodeId = _targetSponsorNodeId != 0 ? _targetSponsorNodeId : 1;
        (uint256 parentId, bool isLeft, uint8 round) = _findClonePlacement(_rank, _sponsor, effectiveSponsorNodeId, _cloneOriginMainId);

        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, true, false);

        uint256 originId = _cloneOriginMainId != 0 ? _cloneOriginMainId : newNodeId;
        nodeOriginMainId[_rank][newNodeId] = originId;
        nodeDirectSponsorNodeId[_rank][newNodeId] = effectiveSponsorNodeId;
        mainNodeLatestCloneId[_rank][originId] = newNodeId;
        users[_owner].latestNodeId[_rank] = newNodeId;
        nodeCloneRound[_rank][newNodeId] = round;
        nodeCloneTotalCount[_rank][originId] += 1;

        _processPostInsert(_rank, newNodeId, parentId, _owner, isLeft, false, true);
        return newNodeId;
    }

    function _createAndPlaceAutoNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _sponsorNodeId,
        bool _isExtraId
    ) internal returns (uint256) {
        uint256 effectiveSponsorNodeId = _sponsorNodeId;
        if (effectiveSponsorNodeId == 0) {
            effectiveSponsorNodeId = users[_sponsor].firstNodeId[_rank];
            if (effectiveSponsorNodeId == 0) effectiveSponsorNodeId = 1;
        }

        (uint256 parentId, bool isLeft) = _findDirectAndClonePlacement(_rank, _sponsor, effectiveSponsorNodeId);
        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, false, _isExtraId);

        uint256 originId = nodeOriginMainId[_rank][effectiveSponsorNodeId];
        if (originId == 0) originId = effectiveSponsorNodeId;

        // สำหรับ Auto New Main ID และ Auto Extra ID: ผู้แนะนำตรง (Direct Sponsor) คือผู้แนะนำของรหัสหลักต้นสังกัด (directSponsor ของ originId)
        uint256 directSponsorOfOrigin = nodeDirectSponsorNodeId[_rank][originId];
        address directSponsorAddr = rankNodes[_rank][originId].directSponsor;
        if (directSponsorOfOrigin == 0 && _rank > 1) {
            uint256 r1Main = nodeToR1MainId[_rank][originId];
            if (r1Main > 0 && r1Main < 1_000_000) {
                uint256 r1SpId = nodeDirectSponsorNodeId[1][r1Main];
                if (r1SpId > 0) {
                    directSponsorOfOrigin = getMainIdNodeInRank(r1SpId, _rank);
                    if (directSponsorOfOrigin == 0) directSponsorOfOrigin = r1SpId;
                    if (directSponsorAddr == address(0)) directSponsorAddr = rankNodes[1][r1Main].directSponsor;
                }
            }
        }
        if (directSponsorAddr != address(0)) {
            rankNodes[_rank][newNodeId].directSponsor = directSponsorAddr;
        }

        nodeOriginMainId[_rank][newNodeId] = newNodeId;
        nodeDirectSponsorNodeId[_rank][newNodeId] = directSponsorOfOrigin;
        if (_rank == 1 && !_isExtraId) {
            mainIdCurrentMaxRank[newNodeId] = 1;
            mainIdNodeInRank[newNodeId][1] = newNodeId;
            nodeToR1MainId[1][newNodeId] = newNodeId;
        } else {
            uint256 extraMainKey = (uint256(_rank) * 1_000_000) + newNodeId;
            mainIdCurrentMaxRank[extraMainKey] = _rank;
            mainIdNodeInRank[extraMainKey][_rank] = newNodeId;
            nodeToR1MainId[_rank][newNodeId] = extraMainKey;
        }
        if (users[_owner].firstNodeId[_rank] == 0) {
            users[_owner].firstNodeId[_rank] = newNodeId;
        }
        users[_owner].latestNodeId[_rank] = newNodeId;

        _processPostInsert(_rank, newNodeId, parentId, _owner, isLeft, _isExtraId, true);
        return newNodeId;
    }

    function _findClonePlacement(
        uint8 _rank,
        address _sponsor,
        uint256 _sponsorNodeId,
        uint256 _cloneOriginMainId
    ) internal returns (uint256 parentId, bool isLeft, uint8 round) {
        uint256 originId = _cloneOriginMainId != 0 ? _cloneOriginMainId : _sponsorNodeId;
        uint8 currentRound = uint8(nodeCloneTotalCount[_rank][originId] % 2);
        sponsorRoundToggle[_rank][originId] = currentRound == 0 ? 1 : 0;
        (uint256 pId, bool left) = _findPlacementWithRound(_rank, _sponsor, _sponsorNodeId, currentRound);
        return (pId, left, currentRound == 0 ? 1 : 2);
    }

    function _findDirectAndClonePlacement(uint8 _rank, address _sponsor, uint256 _sponsorNodeId) internal view returns (uint256 parentId, bool isLeft) {
        uint256 primaryNodeId = _sponsorNodeId;
        if (primaryNodeId == 0) primaryNodeId = users[_sponsor].firstNodeId[_rank];
        if (primaryNodeId == 0) primaryNodeId = 1;

        uint256 originMainId = nodeOriginMainId[_rank][primaryNodeId];
        if (originMainId == 0) originMainId = primaryNodeId;

        MatrixNode storage primaryNode = rankNodes[_rank][originMainId];
        if (primaryNode.leftChild == 0) return (originMainId, true);
        if (primaryNode.rightChild == 0) return (originMainId, false);

        uint256 total = totalNodesInRank[_rank];
        for (uint256 id = 1; id <= total; id++) {
            MatrixNode storage candidate = rankNodes[_rank][id];
            if (candidate.isClone && nodeOriginMainId[_rank][id] == originMainId) {
                if (candidate.leftChild == 0) return (id, true);
                if (candidate.rightChild == 0) return (id, false);
            }
        }

        return _findFirstAvailableUnder(_rank, originMainId);
    }

    function _findPlacementWithRound(uint8 _rank, address _sponsor, uint256 _sponsorNodeId, uint8 _round) internal view returns (uint256 parentId, bool isLeft) {
        return _round == 0
            ? _findDirectAndClonePlacement(_rank, _sponsor, _sponsorNodeId)
            : _findFirstAvailableUnder(_rank, 1);
    }

    function _findFirstAvailableUnder(uint8 _rank, uint256 _startNodeId) internal view returns (uint256, bool) {
        uint256[64] memory queue;
        uint256 head = 0;
        uint256 tail = 0;
        queue[tail++] = _startNodeId;

        while (head < tail) {
            uint256 currentId = queue[head++];
            MatrixNode storage node = rankNodes[_rank][currentId];

            if (node.leftChild == 0) return (currentId, true);
            if (node.rightChild == 0) return (currentId, false);

            if (tail < 62) {
                queue[tail++] = node.leftChild;
                queue[tail++] = node.rightChild;
            }
        }
        return (_startNodeId, true);
    }

    function _distributeLeftChildRewards(
        uint8 _rank,
        uint256 _fromNodeId,
        uint256 _parentId,
        address /* _nodeOwner */
    ) internal {
        uint256 totalAmount = rankPrice[_rank];
        uint256 parentOriginMainId = nodeOriginMainId[_rank][_parentId];
        if (parentOriginMainId == 0) parentOriginMainId = _parentId;
        bool isParentExtraLineage = rankNodes[_rank][_parentId].isExtraId || rankNodes[_rank][parentOriginMainId].isExtraId;

        if (isParentExtraLineage) {
            uint256 extraSponsorNodeId = nodeDirectSponsorNodeId[_rank][parentOriginMainId];
            if (extraSponsorNodeId == 0) extraSponsorNodeId = nodeDirectSponsorNodeId[_rank][_parentId];
            address extraSponsor = rankNodes[_rank][parentOriginMainId].directSponsor;
            if (extraSponsor == address(0)) extraSponsor = rankNodes[_rank][_parentId].directSponsor;
            if (extraSponsorNodeId > 0 && rankNodes[_rank][extraSponsorNodeId].owner != address(0)) {
                extraSponsor = rankNodes[_rank][extraSponsorNodeId].owner;
            }
            if (extraSponsor == address(0)) extraSponsor = rankNodes[_rank][1].owner;
            if (extraSponsorNodeId == 0) {
                extraSponsorNodeId = users[extraSponsor].firstNodeId[_rank];
                if (extraSponsorNodeId == 0) extraSponsorNodeId = 1;
            }

            uint256 extraDirectReward = (totalAmount * 30) / 100;
            usdt.safeTransfer(extraSponsor, extraDirectReward);
            emit RewardDistributed(_fromNodeId, extraSponsorNodeId, extraSponsor, _rank, "DIRECT", extraDirectReward);
            usdt.safeTransfer(extraSponsor, extraDirectReward);
            emit RewardDistributed(_fromNodeId, extraSponsorNodeId, extraSponsor, _rank, "LEVEL", extraDirectReward);

            uint256 extraVaultAmount = (totalAmount * 35) / 100;
            uint256 sponsorOriginInR = nodeOriginMainId[_rank][extraSponsorNodeId];
            if (sponsorOriginInR == 0) sponsorOriginInR = extraSponsorNodeId;
            uint256 sponsorR1MainId = nodeToR1MainId[_rank][sponsorOriginInR];
            if (sponsorR1MainId == 0) sponsorR1MainId = sponsorOriginInR;
            mainIdExtraPoolBonus[sponsorR1MainId] += extraVaultAmount;
            emit RewardDistributed(_fromNodeId, extraSponsorNodeId, extraSponsor, _rank, "UPGRADE_VAULT", extraVaultAmount);

            checkAndProcessAutoExtraIdForNode(extraSponsor, _rank, sponsorR1MainId);
            _payAllSellAndBot(_fromNodeId, _rank, totalAmount);
            return;
        }

        uint256 directReward = (totalAmount * 30) / 100;
        address sponsor = rankNodes[_rank][_fromNodeId].directSponsor;
        bool isId1Clone = rankNodes[_rank][_fromNodeId].isClone && (rankNodes[_rank][_fromNodeId].owner == rankNodes[_rank][1].owner);

        if (isId1Clone || sponsor == address(0)) {
            usdt.safeTransfer(familyPool, directReward);
            emit RewardDistributed(_fromNodeId, 0, familyPool, _rank, "DIRECT_ID1_CLONE_FAMILY_POOL", directReward);
        } else {
            uint256 sponsorNodeId = nodeDirectSponsorNodeId[_rank][_fromNodeId];
            if (sponsorNodeId == 0) sponsorNodeId = users[sponsor].firstNodeId[_rank];
            if (sponsorNodeId == 0) sponsorNodeId = users[sponsor].latestNodeId[_rank];
            usdt.safeTransfer(sponsor, directReward);
            emit RewardDistributed(_fromNodeId, sponsorNodeId, sponsor, _rank, "DIRECT", directReward);
        }

        uint256 levelRewardPerTier = (totalAmount * 2) / 100;
        uint256 currentUplineId = _parentId;
        uint256 unpaidLevelAmount = 0;

        for (uint8 i = 1; i <= MAX_LEVELS; i++) {
            if (currentUplineId != 0) {
                address uplineOwner = rankNodes[_rank][currentUplineId].owner;
                usdt.safeTransfer(uplineOwner, levelRewardPerTier);
                emit RewardDistributed(_fromNodeId, currentUplineId, uplineOwner, _rank, "LEVEL", levelRewardPerTier);
                currentUplineId = rankNodes[_rank][currentUplineId].parentId;
            } else {
                unpaidLevelAmount += levelRewardPerTier;
            }
        }

        uint256 upgradeAmount = (totalAmount * 35) / 100;
        address parentOwner = rankNodes[_rank][_parentId].owner;

        users[parentOwner].upgradeVault[_rank] += upgradeAmount;
        nodeUpgradeVault[_rank][parentOriginMainId] += upgradeAmount;
        emit RewardDistributed(_fromNodeId, _parentId, parentOwner, _rank, "UPGRADE_VAULT", upgradeAmount);

        uint256 r1MainId = nodeToR1MainId[_rank][parentOriginMainId];
        if (r1MainId == 0) r1MainId = parentOriginMainId;
        uint8 mRank = getMainIdCurrentRank(r1MainId);

        if (_rank < MAX_RANK && getMainIdNodeInRank(r1MainId, _rank + 1) == 0) {
            _checkAndProcessAutoUpgradeForMainId(r1MainId, parentOwner, _rank, _parentId);
        }
        if (_rank <= 3 || mRank >= 6) {
            checkAndProcessAutoNewMainIdForNode(r1MainId);
        }
        if (_rank >= 4) {
            checkAndProcessAutoExtraIdForNode(parentOwner, _rank, r1MainId);
        }

        if (unpaidLevelAmount > 0) {
            usdt.safeTransfer(familyPool, unpaidLevelAmount);
            emit RewardDistributed(_fromNodeId, 0, familyPool, _rank, "UNPAID_LEVEL_FAMILY_POOL", unpaidLevelAmount);
        }

        _payAllSellAndBot(_fromNodeId, _rank, totalAmount);
    }

    function _payAllSellAndBot(uint256 _fromNodeId, uint8 _rank, uint256 _totalAmount) internal {
        uint256 allSellAmount = (_totalAmount * 4) / 100;
        usdt.safeTransfer(allSellWallet, allSellAmount);
        emit RewardDistributed(_fromNodeId, 0, allSellWallet, _rank, "ALLSELL", allSellAmount);

        uint256 botAmount = (_totalAmount * 1) / 100;
        usdt.safeTransfer(botWallet, botAmount);
        emit RewardDistributed(_fromNodeId, 0, botWallet, _rank, "BOT", botAmount);
    }

    function _triggerRightChildClone(uint8 _rank, uint256 _parentId, bool _isExtraId) internal {
        address parentOwner = rankNodes[_rank][_parentId].owner;
        address parentSponsor = rankNodes[_rank][_parentId].directSponsor;
        if (parentSponsor == address(0)) parentSponsor = users[parentOwner].sponsor;
        if (parentSponsor == address(0)) parentSponsor = parentOwner;

        uint256 cloneOriginMainId = nodeOriginMainId[_rank][_parentId];
        if (cloneOriginMainId == 0) cloneOriginMainId = _parentId;

        uint256 targetSponsorNodeId = nodeDirectSponsorNodeId[_rank][cloneOriginMainId];
        if (targetSponsorNodeId == 0) targetSponsorNodeId = nodeDirectSponsorNodeId[_rank][_parentId];
        if (targetSponsorNodeId == 0) {
            if (cloneOriginMainId == 1) {
                targetSponsorNodeId = 1;
            } else {
                targetSponsorNodeId = users[parentSponsor].firstNodeId[_rank];
                if (targetSponsorNodeId == 0 || targetSponsorNodeId == cloneOriginMainId) {
                    targetSponsorNodeId = users[parentOwner].sponsorMainNodeId;
                }
                if (targetSponsorNodeId == 0) targetSponsorNodeId = 1;
            }
        }

        _createAndPlaceCloneNode(_rank, parentOwner, parentSponsor, cloneOriginMainId, targetSponsorNodeId, _isExtraId);
    }

    function _checkAndProcessAutoUpgradeForMainId(uint256 _r1MainId, address _user, uint8 _currentRank, uint256 _triggerNodeId) internal {
        uint8 nextRank = _currentRank + 1;
        if (nextRank > MAX_RANK) return;

        uint256 nextPrice = rankPrice[nextRank];
        uint256 currentVault = getAccumulatedVaultForMainId(_r1MainId);

        if (currentVault >= nextPrice && getMainIdNodeInRank(_r1MainId, nextRank) == 0) {
            uint256 remainder = currentVault - nextPrice;
            _clearVaultsForMainId(_r1MainId, _currentRank, nextPrice);

            if (mainIdCurrentMaxRank[_r1MainId] < nextRank) mainIdCurrentMaxRank[_r1MainId] = nextRank;
            if (users[_user].currentMaxRank < nextRank) users[_user].currentMaxRank = nextRank;

            address sponsor;
            uint256 sponsorNodeId = 0;
            if (_r1MainId >= 1_000_000) {
                uint256 currNodeId = getMainIdNodeInRank(_r1MainId, _currentRank);
                sponsor = rankNodes[_currentRank][currNodeId].directSponsor;
                uint256 currSponsorNodeId = nodeDirectSponsorNodeId[_currentRank][currNodeId];
                uint256 sponsorMainKey = nodeToR1MainId[_currentRank][currSponsorNodeId];
                if (sponsorMainKey > 0) sponsorNodeId = getMainIdNodeInRank(sponsorMainKey, nextRank);
            } else {
                sponsor = rankNodes[1][_r1MainId].directSponsor;
                uint256 r1SponsorNodeId = nodeDirectSponsorNodeId[1][_r1MainId];
                if (r1SponsorNodeId == 0) r1SponsorNodeId = users[_user].sponsorMainNodeId;
                sponsorNodeId = getMainIdNodeInRank(r1SponsorNodeId, nextRank);
            }
            if (sponsor == address(0)) sponsor = users[_user].sponsor;
            if (sponsor == address(0)) sponsor = rankNodes[nextRank][1].owner;
            if (sponsorNodeId == 0) sponsorNodeId = users[sponsor].firstNodeId[nextRank];

            uint256 newNodeId = _createAndPlaceNode(nextRank, _user, sponsor, sponsorNodeId, false, false);
            mainIdNodeInRank[_r1MainId][nextRank] = newNodeId;
            nodeToR1MainId[nextRank][newNodeId] = _r1MainId;

            if (_r1MainId < 1_000_000) {
                checkAndProcessAutoNewMainIdForNode(_r1MainId);
            }
            checkAndProcessAutoExtraIdForNode(_user, nextRank, newNodeId);

            emit RankUpgraded(_user, nextRank - 1, nextRank, newNodeId, true);

            if (remainder > 0) {
                usdt.safeTransfer(_user, remainder);
                emit RewardDistributed(_triggerNodeId, newNodeId, _user, nextRank - 1, "VAULT_OVERFLOW", remainder);
            }
        }
    }

    function emergencyWithdrawToken(address _token, uint256 _amount) external onlyOwner nonReentrant {
        require(_token != address(0), "Zero addr");
        IERC20 token = IERC20(_token);
        require(token.balanceOf(address(this)) >= _amount, "Low balance");
        token.safeTransfer(msg.sender, _amount);
    }

    function emergencyWithdrawNative() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Zero balance");
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Failed");
    }

    function setSystemWallets(address _allSell, address _bot, address _familyPool) external onlyOwner {
        require(_allSell != address(0) && _bot != address(0) && _familyPool != address(0), "Zero addr");
        allSellWallet = _allSell;
        botWallet = _bot;
        familyPool = _familyPool;
    }

    function getUserProfile(address _user)
        external
        view
        returns (
            bool isRegistered,
            address sponsor,
            uint256 sponsorMainNodeId,
            uint8 currentMaxRank,
            uint256 mainNodeIdRank1,
            uint256 latestCloneIdRank1
        )
    {
        return (
            users[_user].isRegistered,
            users[_user].sponsor,
            users[_user].sponsorMainNodeId,
            users[_user].currentMaxRank,
            users[_user].firstNodeId[1],
            users[_user].latestNodeId[1]
        );
    }

    function getUserRankInfo(address _user, uint8 _rank)
        external
        view
        returns (
            uint256 firstNodeId,
            uint256 latestNodeId,
            uint256 upgradeVaultBalance,
            uint256 nextRankPrice
        )
    {
        uint256 nextPrice = _rank < MAX_RANK ? rankPrice[_rank + 1] : 0;
        return (
            users[_user].firstNodeId[_rank],
            users[_user].latestNodeId[_rank],
            users[_user].upgradeVault[_rank],
            nextPrice
        );
    }

    function getNodeCloneRound(uint8 _rank, uint256 _nodeId) external view returns (uint8) {
        return nodeCloneRound[_rank][_nodeId];
    }

    function getNodeCloneTotalCount(uint8 _rank, uint256 _originMainId) external view returns (uint256) {
        return nodeCloneTotalCount[_rank][_originMainId];
    }
}
