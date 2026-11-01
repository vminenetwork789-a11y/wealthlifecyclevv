// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FractalFlowMatrix27 (EIP-170 Highly Optimized < 20 KB)
 * @notice Fully compliant with EVM EIP-170 24,576 bytes deployed bytecode limit.
 * - 27 Ranks (5 to 10,000 USDT)
 * - 15 Levels Binary Matrix (2:1 spillover rewards)
 * - 5-Rank Sliding Window Vault
 * - Direct Sponsor Left/Right Auto Placement & 2-Round Clone toggle
 * - Auto New Main ID (Rank 1-3 pools)
 * - Auto Extra ID (Rank 4+ pools, prioritized under direct sponsor & sponsor's clones)
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
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool s, bytes memory d) = address(token).call(abi.encodeWithSelector(token.transfer.selector, to, value));
        require(s && (d.length == 0 || abi.decode(d, (bool))), "TF");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool s, bytes memory d) = address(token).call(abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
        require(s && (d.length == 0 || abi.decode(d, (bool))), "TFF");
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
        if (initialOwner == address(0)) revert OwnableInvalidOwner(address(0));
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
        if (owner() != _msgSender()) revert OwnableUnauthorizedAccount(_msgSender());
    }

    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) revert OwnableInvalidOwner(address(0));
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

    // Custom errors for bytecode compression
    error ErrInvalidSponsor();
    error ErrNotOwner();
    error ErrInvalidRank();
    error ErrStepByStep();
    error ErrRankActive();
    error ErrBadParam();
    error ErrZero();
    error ErrNotRegistered();

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
        if (_usdt == address(0) || _rootUser == address(0)) revert ErrZero();

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

    function previewPlacement(uint8 _rank, address _sponsor)
        public
        view
        returns (uint256 targetParentId, bool isLeft, uint8 activeRound)
    {
        uint256 sponsorNodeId = users[_sponsor].firstNodeId[_rank];
        activeRound = sponsorNodeId > 0 ? sponsorRoundToggle[_rank][sponsorNodeId] : 0;
        (targetParentId, isLeft) = _findPlacementWithRound(_rank, _sponsor, sponsorNodeId, activeRound);
    }

    function previewPlacement(uint8 _rank, uint256 _sponsorNodeId)
        external
        view
        returns (uint256 targetParentId, bool isLeft, uint8 activeRound)
    {
        (bool isValid, , address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        if (!isValid) revert ErrInvalidSponsor();
        return previewPlacement(_rank, sponsorAddr);
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
        address nodeOwner = _r1MainId >= 1_000_000
            ? rankNodes[_currentRank][getMainIdNodeInRank(_r1MainId, _currentRank)].owner
            : rankNodes[1][_r1MainId].owner;
        _deductVaultRange(_r1MainId, nodeOwner, startRank, endRank, _amountToDeduct);
    }

    function _deductVaultRange(
        uint256 _r1MainId,
        address _owner,
        uint8 _start,
        uint8 _end,
        uint256 _amount
    ) internal returns (uint256 rem) {
        rem = _amount;
        for (uint8 r = _start; r <= _end && rem > 0; r++) {
            uint256 nId = getMainIdNodeInRank(_r1MainId, r);
            if (nId == 0) continue;
            uint256 bal = nodeUpgradeVault[r][nId];
            if (bal > 0) {
                uint256 deduct = bal <= rem ? bal : rem;
                rem -= deduct;
                _deductNodeVault(_owner, r, nId, deduct);
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

        for (uint8 pass = 0; pass < 10; pass++) {
            bool spawned = false;
            for (uint8 targetRank = MAX_RANK; targetRank >= 2; targetRank--) {
                uint256 pool = _calcExtraPool(r1MainId, mainMaxRank, window5Start);
                uint256 price = rankPrice[targetRank];
                if (price == 0 || pool < price) continue;
                if (getMainIdNodeInRank(r1MainId, targetRank) == 0) continue;

                _deductExtraPool(r1MainId, nodeOwner, price, mainMaxRank, window5Start);
                _spawnExtraNode(r1MainId, nodeOwner, targetRank);
                spawned = true;
            }
            if (!spawned) break;
        }
    }

    function _deductExtraPool(
        uint256 _r1MainId,
        address _nodeOwner,
        uint256 _targetPrice,
        uint8 _mainMaxRank,
        uint8 _window5Start
    ) internal {
        uint256 rem = _targetPrice;
        uint256 bonus = mainIdExtraPoolBonus[_r1MainId];
        if (bonus > 0) {
            uint256 bDeduct = bonus <= rem ? bonus : rem;
            mainIdExtraPoolBonus[_r1MainId] -= bDeduct;
            rem -= bDeduct;
        }
        if (rem > 0) {
            uint8 endR = _mainMaxRank == MAX_RANK ? MAX_RANK : (_window5Start > 4 ? _window5Start - 1 : 4);
            _deductVaultRange(_r1MainId, _nodeOwner, 4, endR, rem);
        }
    }

    function _spawnExtraNode(uint256 _r1MainId, address _nodeOwner, uint8 _targetRank) internal {
        uint256 r1SponsorId = nodeDirectSponsorNodeId[1][_r1MainId];
        address directSponsorAddr = rankNodes[1][_r1MainId].directSponsor;
        if (directSponsorAddr == address(0)) directSponsorAddr = _nodeOwner;
        uint256 sponsorNodeInTarget = r1SponsorId > 0 ? getMainIdNodeInRank(r1SponsorId, _targetRank) : 0;

        uint256 extraNodeId = _createAndPlaceAutoNode(_targetRank, _nodeOwner, directSponsorAddr, sponsorNodeInTarget, true);
        if (r1SponsorId > 0) {
            nodeDirectSponsorNodeId[_targetRank][extraNodeId] = r1SponsorId;
        }
        emit AutoExtraIdCreated(_nodeOwner, _targetRank, extraNodeId);
        mainIdNextExtraRank[_r1MainId] = _targetRank > 2 ? _targetRank - 1 : MAX_RANK;
    }

    function getNodeVault(uint8 _rank, uint256 _nodeId) external view returns (uint256) {
        return nodeUpgradeVault[_rank][_nodeId];
    }

    function checkAndProcessAutoNewMainIdForNode(uint256 _mainNodeId) public {
        if (_mainNodeId == 0 || _mainNodeId > totalNodesInRank[1]) revert ErrBadParam();
        address nodeOwner = rankNodes[1][_mainNodeId].owner;
        if (nodeOwner == address(0)) revert ErrZero();

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
                uint8 endR = window5Start > 3 ? 3 : (window5Start > 1 ? window5Start - 1 : 1);
                _deductVaultRange(r1MainId, nodeOwner, 1, endR, totalDeduct);

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
        uint256[] calldata _targetParentIds,
        bool[] calldata _isLefts,
        bool[] calldata _isClones
    ) external nonReentrant {
        if (_count == 0) revert ErrBadParam();
        (bool isValid, , address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        if (!isValid) revert ErrInvalidSponsor();

        uint256 totalCost = rankPrice[1] * _count;
        usdt.safeTransferFrom(msg.sender, address(this), totalCost);
        _ensureRegistered(msg.sender, sponsorAddr, _sponsorNodeId);

        uint256 firstCreated = 0;
        bool hasTargets = _targetParentIds.length == _count && _isLefts.length == _count && _isClones.length == _count;

        for (uint256 i = 0; i < _count; i++) {
            uint256 pId = hasTargets ? _targetParentIds[i] : 0;
            bool isL = hasTargets ? _isLefts[i] : true;
            bool isC = hasTargets ? _isClones[i] : false;

            uint256 nId = _insertBatchItem(_sponsorNodeId, sponsorAddr, pId, isL, isC);
            if (firstCreated == 0) firstCreated = nId;
        }

        emit UserRegistered(msg.sender, sponsorAddr, _sponsorNodeId, firstCreated);
        emit BatchRegistered(msg.sender, _count, totalCost);
    }

    function _insertBatchItem(
        uint256 _spNodeId,
        address _spAddr,
        uint256 _targetParentId,
        bool _isLeft,
        bool _isClone
    ) internal returns (uint256 newNodeId) {
        uint256 pId = _targetParentId;
        bool isL = _isLeft;
        if (pId == 0 || pId > totalNodesInRank[1] || (isL && rankNodes[1][pId].leftChild != 0) || (!isL && rankNodes[1][pId].rightChild != 0)) {
            (pId, isL) = _findFirstAvailableUnder(1, _spNodeId);
        }

        newNodeId = _insertRawNode(1, msg.sender, _spAddr, pId, isL, _isClone, false);

        if (!_isClone) {
            nodeOriginMainId[1][newNodeId] = newNodeId;
            nodeDirectSponsorNodeId[1][newNodeId] = _spNodeId;
            mainIdCurrentMaxRank[newNodeId] = 1;
            mainIdNodeInRank[newNodeId][1] = newNodeId;
            nodeToR1MainId[1][newNodeId] = newNodeId;
            if (users[msg.sender].firstNodeId[1] == 0) {
                users[msg.sender].firstNodeId[1] = newNodeId;
            }
        }
        users[msg.sender].latestNodeId[1] = newNodeId;
        _processPostInsert(1, newNodeId, pId, msg.sender, isL, false, true);
    }

    function register(uint256 _sponsorNodeId) external nonReentrant {
        (bool isValid, string memory reason, address sponsorAddr) = checkValidSponsorId(_sponsorNodeId);
        if (!isValid) revert ErrInvalidSponsor();

        usdt.safeTransferFrom(msg.sender, address(this), rankPrice[1]);
        _ensureRegistered(msg.sender, sponsorAddr, _sponsorNodeId);

        uint256 newMainNodeId = _createAndPlaceNode(1, msg.sender, sponsorAddr, _sponsorNodeId);
        mainIdCurrentMaxRank[newMainNodeId] = 1;
        mainIdNodeInRank[newMainNodeId][1] = newMainNodeId;
        nodeToR1MainId[1][newMainNodeId] = newMainNodeId;

        emit UserRegistered(msg.sender, sponsorAddr, _sponsorNodeId, newMainNodeId);
    }

    function upgradeRankForMainId(uint256 _r1MainId, uint8 _targetRank) public nonReentrant {
        if (_r1MainId == 0 || _r1MainId > totalNodesInRank[1]) revert ErrBadParam();
        MatrixNode storage mNode = rankNodes[1][_r1MainId];
        if (mNode.owner != msg.sender) revert ErrNotOwner();
        if (mNode.isClone || mNode.isExtraId) revert ErrBadParam();
        if (_targetRank <= 1 || _targetRank > MAX_RANK) revert ErrInvalidRank();

        uint8 currentRank = getMainIdCurrentRank(_r1MainId);
        if (_targetRank != currentRank + 1) revert ErrStepByStep();
        if (getMainIdNodeInRank(_r1MainId, _targetRank) != 0) revert ErrRankActive();

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

        // ใน Rank 2-27 หากผู้แนะนำตรงยังไม่ได้อัปเกรดขึ้นมา (sponsorNodeIdInTarget == 0)
        // จะหาตำแหน่งว่างชั้นตื้นลงมาจากซ้ายไปขวา (BFS จาก Root #1)
        uint256 sponsorNodeIdInTarget = r1SponsorNodeId > 0 ? getMainIdNodeInRank(r1SponsorNodeId, _targetRank) : 0;

        uint256 newNodeId = _createAndPlaceNode(_targetRank, msg.sender, sponsor, sponsorNodeIdInTarget);
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
        if (r1MainId == 0) revert ErrNotRegistered();
        upgradeRankForMainId(r1MainId, _targetRank);
    }

    function adminUpgradeRankForMainId(uint256 _r1MainId, uint8 _targetRank) public onlyOwner nonReentrant {
        if (_r1MainId == 0 || _r1MainId > totalNodesInRank[1]) revert ErrBadParam();
        MatrixNode storage mNode = rankNodes[1][_r1MainId];
        if (mNode.owner == address(0) || mNode.isClone || mNode.isExtraId) revert ErrBadParam();
        if (_targetRank <= 1 || _targetRank > MAX_RANK) revert ErrInvalidRank();

        address targetUser = mNode.owner;
        uint8 currentRank = getMainIdCurrentRank(_r1MainId);
        if (_targetRank <= currentRank) revert ErrRankActive();

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

            uint256 newNodeId = _placeStandardNode(r, targetUser, sponsor, spNodeInR, false);
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
        if (!users[_user].isRegistered) revert ErrNotRegistered();
        uint256 r1MainId = users[_user].firstNodeId[1];
        if (r1MainId == 0) revert ErrBadParam();
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
        if (_parentId == 0 || _parentId > totalNodesInRank[_rank]) revert ErrBadParam();
        MatrixNode storage parentNode = rankNodes[_rank][_parentId];
        if (_isLeft ? parentNode.leftChild != 0 : parentNode.rightChild != 0) revert ErrBadParam();

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
        uint256 _sponsorNodeId
    ) internal returns (uint256) {
        return _placeStandardNode(_rank, _owner, _sponsor, _sponsorNodeId, true);
    }

    function _placeStandardNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _sponsorNodeId,
        bool _payCommission
    ) internal returns (uint256) {
        uint256 effSponsor = _sponsorNodeId;
        if (_rank == 1 && effSponsor == 0) {
            effSponsor = users[_sponsor].firstNodeId[1];
            if (effSponsor == 0) effSponsor = 1;
        }

        (uint256 parentId, bool isLeft) = _findDirectAndClonePlacement(_rank, _sponsor, effSponsor);
        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, false, false);

        nodeOriginMainId[_rank][newNodeId] = newNodeId;
        nodeDirectSponsorNodeId[_rank][newNodeId] = effSponsor > 0 ? effSponsor : 1;
        if (_rank == 1) {
            mainIdCurrentMaxRank[newNodeId] = 1;
            mainIdNodeInRank[newNodeId][1] = newNodeId;
            nodeToR1MainId[1][newNodeId] = newNodeId;
        }
        if (users[_owner].firstNodeId[_rank] == 0) {
            users[_owner].firstNodeId[_rank] = newNodeId;
        }
        users[_owner].latestNodeId[_rank] = newNodeId;

        _processPostInsert(_rank, newNodeId, parentId, _owner, isLeft, false, _payCommission);
        return newNodeId;
    }

    function _createAndPlaceCloneNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _cloneOriginMainId,
        uint256 _targetSponsorNodeId,
        uint256 _r1SponsorId
    ) internal returns (uint256) {
        (uint256 parentId, bool isLeft, uint8 round) = _findClonePlacement(_rank, _sponsor, _targetSponsorNodeId, _cloneOriginMainId);
        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, true, false);

        uint256 originId = _cloneOriginMainId != 0 ? _cloneOriginMainId : newNodeId;
        nodeOriginMainId[_rank][newNodeId] = originId;
        nodeDirectSponsorNodeId[_rank][newNodeId] = _r1SponsorId != 0 ? _r1SponsorId : (_targetSponsorNodeId != 0 ? _targetSponsorNodeId : 1);
        uint256 r1Main = _rank == 1 ? originId : (originId <= totalNodesInRank[1] ? originId : nodeToR1MainId[_rank][originId]);
        if (r1Main > 0) nodeToR1MainId[_rank][newNodeId] = r1Main;
        mainNodeLatestCloneId[_rank][originId] = newNodeId;
        users[_owner].latestNodeId[_rank] = newNodeId;
        nodeCloneRound[_rank][newNodeId] = round;
        nodeCloneTotalCount[_rank][originId] += 1;

        _processPostInsert(_rank, newNodeId, parentId, _owner, isLeft, false, true);
        return newNodeId;
    }

    function _resolveAutoSponsor(uint8 _rank, uint256 _originId, address _sponsor) internal view returns (uint256 spId, address spAddr) {
        spId = _originId > 0 ? nodeDirectSponsorNodeId[_rank][_originId] : 0;
        spAddr = _originId > 0 ? rankNodes[_rank][_originId].directSponsor : _sponsor;
        if (spId == 0 && _rank > 1 && _originId > 0) {
            uint256 r1Main = nodeToR1MainId[_rank][_originId];
            if (r1Main > 0 && r1Main < 1_000_000) {
                uint256 r1SpId = nodeDirectSponsorNodeId[1][r1Main];
                if (r1SpId > 0) {
                    spId = getMainIdNodeInRank(r1SpId, _rank);
                    if (spId == 0) spId = r1SpId;
                    if (spAddr == address(0)) spAddr = rankNodes[1][r1Main].directSponsor;
                }
            }
        }
        if (spId == 0) spId = 1;
    }

    function _createAndPlaceAutoNode(
        uint8 _rank,
        address _owner,
        address _sponsor,
        uint256 _sponsorNodeId,
        bool _isExtraId
    ) internal returns (uint256) {
        uint256 effSponsor = _sponsorNodeId;
        if (_rank == 1 && effSponsor == 0) {
            effSponsor = users[_sponsor].firstNodeId[1];
            if (effSponsor == 0) effSponsor = 1;
        }

        (uint256 parentId, bool isLeft) = _findPlacementSpot(_rank, _sponsor, effSponsor, _isExtraId);
        uint256 newNodeId = _insertRawNode(_rank, _owner, _sponsor, parentId, isLeft, false, _isExtraId);

        uint256 originId = effSponsor > 0 ? nodeOriginMainId[_rank][effSponsor] : 0;
        if (originId == 0) originId = effSponsor;

        (uint256 spId, address spAddr) = _resolveAutoSponsor(_rank, originId, _sponsor);
        if (spAddr != address(0)) {
            rankNodes[_rank][newNodeId].directSponsor = spAddr;
        }

        nodeOriginMainId[_rank][newNodeId] = newNodeId;
        nodeDirectSponsorNodeId[_rank][newNodeId] = spId;
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

    // Unified placement search engine for Extra ID and Direct/Clone
    function _findPlacementSpot(uint8 _rank, address _sponsor, uint256 _sponsorNodeId, bool _isExtra) internal view returns (uint256, bool) {
        if (_sponsorNodeId == 0) {
            if (_rank > 1) return _findFirstAvailableUnder(_rank, 1);
            _sponsorNodeId = users[_sponsor].firstNodeId[1];
            if (_sponsorNodeId == 0) return _findFirstAvailableUnder(1, 1);
        }

        uint256 primaryNodeId = _sponsorNodeId;
        if (primaryNodeId > totalNodesInRank[_rank]) {
            return _findFirstAvailableUnder(_rank, 1);
        }

        uint256 originTag = nodeOriginMainId[_rank][primaryNodeId];
        if (originTag == 0) originTag = primaryNodeId;
        if (!_isExtra && _rank == 1 && originTag <= totalNodesInRank[1]) {
            primaryNodeId = originTag;
        }

        address sponsorOwner = rankNodes[_rank][primaryNodeId].owner;
        if (sponsorOwner == address(0)) sponsorOwner = _sponsor;

        // 1. Direct sponsor node (Left first, then Right)
        MatrixNode storage primaryNode = rankNodes[_rank][primaryNodeId];
        if (primaryNode.leftChild == 0) return (primaryNodeId, true);
        if (primaryNode.rightChild == 0) return (primaryNodeId, false);

        uint256 total = totalNodesInRank[_rank];
        // 2. Direct sponsor's clone nodes (Left first, then Right)
        for (uint256 id = 1; id <= total; id++) {
            if (_isSpClone(_rank, id, sponsorOwner, originTag, primaryNodeId)) {
                if (rankNodes[_rank][id].leftChild == 0) return (id, true);
                if (rankNodes[_rank][id].rightChild == 0) return (id, false);
            }
        }

        // 3. For Auto Extra ID: If clones are full, find shallowest spot under clone subtree
        if (_isExtra) {
            for (uint256 id = 1; id <= total; id++) {
                if (_isSpClone(_rank, id, sponsorOwner, originTag, primaryNodeId)) {
                    (uint256 cParent, bool cLeft) = _findFirstAvailableUnder(_rank, id);
                    if (cParent != id || rankNodes[_rank][id].leftChild == 0 || rankNodes[_rank][id].rightChild == 0) {
                        return (cParent, cLeft);
                    }
                }
            }
        }

        // 4. Fallback: Shallowest spot under primary node
        return _findFirstAvailableUnder(_rank, primaryNodeId);
    }

    function _isSpClone(uint8 _rank, uint256 _id, address _spOwner, uint256 _originTag, uint256 _primaryId) internal view returns (bool) {
        MatrixNode storage c = rankNodes[_rank][_id];
        return c.isClone && (c.owner == _spOwner || nodeOriginMainId[_rank][_id] == _originTag || nodeOriginMainId[_rank][_id] == _primaryId);
    }

    function _findExtraIdPlacement(uint8 _rank, address _sponsor, uint256 _sponsorNodeId) internal view returns (uint256 parentId, bool isLeft) {
        return _findPlacementSpot(_rank, _sponsor, _sponsorNodeId, true);
    }

    function _findDirectAndClonePlacement(uint8 _rank, address _sponsor, uint256 _sponsorNodeId) internal view returns (uint256 parentId, bool isLeft) {
        return _findPlacementSpot(_rank, _sponsor, _sponsorNodeId, false);
    }

    function _findPlacementWithRound(uint8 _rank, address _sponsor, uint256 _sponsorNodeId, uint8 _round) internal view returns (uint256 parentId, bool isLeft) {
        return _round == 0
            ? _findDirectAndClonePlacement(_rank, _sponsor, _sponsorNodeId)
            : _findFirstAvailableUnder(_rank, 1);
    }

    function _findFirstAvailableUnder(uint8 _rank, uint256 _startNodeId) internal view returns (uint256, bool) {
        if (_startNodeId == 0) _startNodeId = 1;
        uint256[40] memory queue;
        uint256 head = 0;
        uint256 tail = 0;
        queue[tail++] = _startNodeId;

        while (head < tail) {
            uint256 currentId = queue[head++];
            MatrixNode storage node = rankNodes[_rank][currentId];

            if (node.leftChild == 0) return (currentId, true);
            if (node.rightChild == 0) return (currentId, false);

            if (tail < 38) {
                queue[tail++] = node.leftChild;
                queue[tail++] = node.rightChild;
            }
        }
        return (_startNodeId, true);
    }

    function _payAndEmit(
        uint256 _fromId,
        uint256 _toId,
        address _toAddr,
        uint8 _rank,
        string memory _rewardType,
        uint256 _amount
    ) internal {
        if (_amount > 0 && _toAddr != address(0)) {
            usdt.safeTransfer(_toAddr, _amount);
            emit RewardDistributed(_fromId, _toId, _toAddr, _rank, _rewardType, _amount);
        }
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
            _payAndEmit(_fromNodeId, extraSponsorNodeId, extraSponsor, _rank, "DIRECT", extraDirectReward);
            _payAndEmit(_fromNodeId, extraSponsorNodeId, extraSponsor, _rank, "LEVEL", extraDirectReward);

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
            _payAndEmit(_fromNodeId, 0, familyPool, _rank, "DIRECT_ID1_CLONE_FAMILY_POOL", directReward);
        } else {
            uint256 sponsorNodeId = nodeDirectSponsorNodeId[_rank][_fromNodeId];
            if (sponsorNodeId == 0) sponsorNodeId = users[sponsor].firstNodeId[_rank];
            if (sponsorNodeId == 0) sponsorNodeId = users[sponsor].latestNodeId[_rank];
            _payAndEmit(_fromNodeId, sponsorNodeId, sponsor, _rank, "DIRECT", directReward);
        }

        uint256 levelRewardPerTier = (totalAmount * 2) / 100;
        uint256 currentUplineId = _parentId;
        uint256 unpaidLevelAmount = 0;

        for (uint8 i = 1; i <= MAX_LEVELS; i++) {
            if (currentUplineId != 0) {
                address uplineOwner = rankNodes[_rank][currentUplineId].owner;
                _payAndEmit(_fromNodeId, currentUplineId, uplineOwner, _rank, "LEVEL", levelRewardPerTier);
                currentUplineId = rankNodes[_rank][currentUplineId].parentId;
            } else {
                unpaidLevelAmount += levelRewardPerTier;
            }
        }

        uint256 upgradeAmount = (totalAmount * 35) / 100;
        address parentOwner = rankNodes[_rank][_parentId].owner;

        uint256 r1MainId = nodeToR1MainId[_rank][_parentId];
        if (r1MainId == 0) r1MainId = nodeToR1MainId[_rank][parentOriginMainId];
        if (r1MainId == 0) r1MainId = parentOriginMainId;
        uint256 vaultTargetNodeId = _rank == 1 ? r1MainId : getMainIdNodeInRank(r1MainId, _rank);
        if (vaultTargetNodeId == 0) vaultTargetNodeId = parentOriginMainId;

        users[parentOwner].upgradeVault[_rank] += upgradeAmount;
        nodeUpgradeVault[_rank][vaultTargetNodeId] += upgradeAmount;
        emit RewardDistributed(_fromNodeId, _parentId, parentOwner, _rank, "UPGRADE_VAULT", upgradeAmount);

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

        _payAndEmit(_fromNodeId, 0, familyPool, _rank, "UNPAID_LEVEL_FAMILY_POOL", unpaidLevelAmount);
        _payAllSellAndBot(_fromNodeId, _rank, totalAmount);
    }

    function _payAllSellAndBot(uint256 _fromNodeId, uint8 _rank, uint256 _totalAmount) internal {
        _payAndEmit(_fromNodeId, 0, allSellWallet, _rank, "ALLSELL", (_totalAmount * 4) / 100);
        _payAndEmit(_fromNodeId, 0, botWallet, _rank, "BOT", (_totalAmount * 1) / 100);
    }

    function _triggerRightChildClone(uint8 _rank, uint256 _parentId, bool /* _isExtraId */) internal {
        address parentOwner = rankNodes[_rank][_parentId].owner;
        address parentSponsor = rankNodes[_rank][_parentId].directSponsor;
        if (parentSponsor == address(0)) parentSponsor = users[parentOwner].sponsor;
        if (parentSponsor == address(0)) parentSponsor = parentOwner;

        uint256 cloneOriginMainId = nodeOriginMainId[_rank][_parentId];
        if (cloneOriginMainId == 0) cloneOriginMainId = _parentId;

        uint256 r1MainId = nodeToR1MainId[_rank][_parentId];
        if (r1MainId == 0 && cloneOriginMainId <= totalNodesInRank[1]) r1MainId = cloneOriginMainId;

        uint256 r1SponsorId = nodeDirectSponsorNodeId[_rank][_parentId];
        if (r1SponsorId == 0 && _rank > 1 && r1MainId > 0 && r1MainId < 1_000_000) {
            r1SponsorId = nodeDirectSponsorNodeId[1][r1MainId];
        }

        uint256 targetSponsorNodeId = 0;
        if (cloneOriginMainId == 1 || r1MainId == 1 || _parentId == 1) {
            targetSponsorNodeId = 1;
        } else if (_rank == 1) {
            targetSponsorNodeId = r1SponsorId != 0 ? r1SponsorId : 1;
        } else if (r1SponsorId > 0) {
            targetSponsorNodeId = getMainIdNodeInRank(r1SponsorId, _rank);
        }

        _createAndPlaceCloneNode(_rank, parentOwner, parentSponsor, cloneOriginMainId, targetSponsorNodeId, r1SponsorId);
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
            uint256 r1SponsorNodeId = 1;
            if (_r1MainId >= 1_000_000) {
                uint256 currNodeId = getMainIdNodeInRank(_r1MainId, _currentRank);
                sponsor = rankNodes[_currentRank][currNodeId].directSponsor;
                uint256 currSponsorNodeId = nodeDirectSponsorNodeId[_currentRank][currNodeId];
                r1SponsorNodeId = currSponsorNodeId > 0 ? currSponsorNodeId : 1;
                sponsorNodeId = getMainIdNodeInRank(r1SponsorNodeId, nextRank);
            } else {
                sponsor = rankNodes[1][_r1MainId].directSponsor;
                r1SponsorNodeId = nodeDirectSponsorNodeId[1][_r1MainId];
                if (r1SponsorNodeId == 0) r1SponsorNodeId = users[_user].sponsorMainNodeId;
                if (r1SponsorNodeId == 0) r1SponsorNodeId = 1;
                sponsorNodeId = getMainIdNodeInRank(r1SponsorNodeId, nextRank);
            }
            if (sponsor == address(0)) sponsor = users[_user].sponsor;
            if (sponsor == address(0)) sponsor = rankNodes[nextRank][1].owner;

            uint256 newNodeId = _createAndPlaceNode(nextRank, _user, sponsor, sponsorNodeId);
            nodeOriginMainId[nextRank][newNodeId] = _r1MainId;
            nodeDirectSponsorNodeId[nextRank][newNodeId] = r1SponsorNodeId;
            mainIdNodeInRank[_r1MainId][nextRank] = newNodeId;
            nodeToR1MainId[nextRank][newNodeId] = _r1MainId;

            if (_r1MainId < 1_000_000) {
                checkAndProcessAutoNewMainIdForNode(_r1MainId);
            }
            checkAndProcessAutoExtraIdForNode(_user, nextRank, newNodeId);

            emit RankUpgraded(_user, nextRank - 1, nextRank, newNodeId, true);

            _payAndEmit(_triggerNodeId, newNodeId, _user, nextRank - 1, "VAULT_OVERFLOW", remainder);
        }
    }

    function emergencyWithdrawToken(address _token, uint256 _amount) external onlyOwner nonReentrant {
        if (_token == address(0)) revert ErrZero();
        IERC20 token = IERC20(_token);
        require(token.balanceOf(address(this)) >= _amount, "Low balance");
        token.safeTransfer(msg.sender, _amount);
    }

    function emergencyWithdrawNative() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance == 0) revert ErrZero();
        (bool success, ) = payable(msg.sender).call{value: balance}("");
        require(success, "Failed");
    }

    function setSystemWallets(address _allSell, address _bot, address _familyPool) external onlyOwner {
        if (_allSell == address(0) || _bot == address(0) || _familyPool == address(0)) revert ErrZero();
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
