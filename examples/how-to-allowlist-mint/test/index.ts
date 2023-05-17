import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import chai, { expect } from "chai";
import ChaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";
import keccak256 from "keccak256";
import { MerkleTree } from "merkletreejs";

chai.use(ChaiAsPromised);

describe("MyERC721", () => {
  it("mint", async () => {
    const deployContractFixture = async () => {
      return await ethers.deployContract("MyERC721");
    };

    const [owner, allowListedUser, notListedUser] = await ethers.getSigners();
    const allowList = [allowListedUser.address];
    const contract = await loadFixture(deployContractFixture);
    const merkleTree = new MerkleTree(allowList.map(keccak256), keccak256, {
      sortPairs: true,
    });
    const hexProof = merkleTree.getHexProof(keccak256(allowList[0]));
    const rootHash = merkleTree.getRoot();

    await contract
      .connect(owner)
      .setMerkleRoot(`0x${rootHash.toString("hex")}`);

    // setMerkleRoot が onlyOwner であるテスト
    await expect(
      contract
        .connect(notListedUser)
        .setMerkleRoot(`0x${rootHash.toString("hex")}`)
    ).to.be.revertedWith("Ownable: caller is not the owner");

    // 現状の balance をテスト
    expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
      BigInt(0)
    );
    expect(await contract.balanceOf(notListedUser.address)).to.be.equal(
      BigInt(0)
    );

    // mint 関数の call をテスト
    await contract.connect(allowListedUser).mint(hexProof);
    await expect(
      contract.connect(notListedUser).mint(hexProof)
    ).to.be.revertedWith("Invalid proof");

    // mint後の balance をテスト
    expect(await contract.balanceOf(allowListedUser.address)).to.be.equal(
      BigInt(1)
    );
    expect(await contract.balanceOf(notListedUser.address)).to.be.equal(
      BigInt(0)
    );
  });
});
