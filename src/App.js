import { useState, useEffect } from 'react';
import './App.css';
import { ethers } from 'ethers';
import * as Yup from 'yup';
import { useFormik } from 'formik';
import { InputAdornment, TextField } from '@mui/material';
import PublicResolverAbi from './abi/PublicResolverAbi.json';
import edxRegistrarControllerAbi from './abi/edxRegistrarControllerAbi.json';

const App = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [ensName, setENSName] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [network, setNetwork] = useState('');
  const [provider, setProvider] = useState(null);
  const [message, setMessage] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showCommit, setShowCommit] = useState(true);
  const [disableCommit, setDisableCommit] = useState(false);
  const [disableRegister, setDisableRegister] = useState(false);
  const [resolverAddress, setResolverAddress] = useState('');
  const [edxRegistrarControllerAddress, setEdxRegistrarControllerAddress] =
    useState('');

  const connectWallet = async () => {
    try {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
    } catch (error) {
      console.error('Error connecting to wallet:', error);
    }
  };

  const fetchENSName = async () => {
    try {
      if (!window.ethereum) return;
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(provider);
      const network = await provider.getNetwork();
      const networkId = network.chainId;
      const accounts = await provider.listAccounts();
      if (!accounts[0]) return;

      if (networkId === 1995) {
        setNetwork('edeXa Testnet');
        setResolverAddress('0x61c743B3fA8714915fc5687Bb6b4903d11cF2146');
        setEdxRegistrarControllerAddress(
          '0x3FF5908aF09530bdf7E351b461e8888f3875Fb58'
        );
      } else if (networkId === 5424) {
        setNetwork('edeXa Mainnet');
        setResolverAddress('0x7Bd7f30Cd71f3A30d6b7df61ce18b22001952a47');
        setEdxRegistrarControllerAddress(
          '0x97Cd4BfBF2d0a6Fd3163cD974ecB6077e4425d0d'
        );
      } else {
        setNetwork('Unknown Address');
        setMessage('Please Connect to edeXa Testnet or Mainnet');
        setDisableCommit(true);
        setDisableRegister(true);
      }

      setWalletAddress(accounts[0]);
      setIsConnected(true);

      const reverseName = `${accounts[0].slice(2)}.addr.reverse`;
      const node = ethers.utils.namehash(reverseName);
      const resolverContract = new ethers.Contract(
        resolverAddress,
        PublicResolverAbi.abi,
        provider
      );
      const ensName_ = await resolverContract.name(node);
      setENSName(ensName_);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchAddress = async (search) => {
    const node = ethers.utils.namehash(search + '.edx');
    const resolverContract = new ethers.Contract(
      resolverAddress,
      PublicResolverAbi.abi,
      provider
    );
    let owner = await resolverContract['addr(bytes32)'](node);
    if (owner !== ethers.constants.AddressZero) {
      return owner;
    } else {
      return ethers.constants.AddressZero;
    }
  };

  const handleCommit = async (domainName) => {
    try {
      const ownerAddress = await fetchAddress(domainName);
      if (ownerAddress !== ethers.constants.AddressZero) {
        setErrors({
          domainName: `Domain already registered by: ${ownerAddress}`,
        });
      } else {
        console.log('Domain is available, committing...');
      }

      const signer = provider.getSigner();
      const edxReg = new ethers.Contract(
        edxRegistrarControllerAddress,
        edxRegistrarControllerAbi.abi,
        signer
      );
      const tx = await edxReg.makeCommitment(
        values,
        walletAddress,
        31536000,
        ethers.utils.formatBytes32String(''),
        resolverAddress,
        [],
        true,
        0
      );
      setDisableCommit(true);

      const tx2 = await edxReg.commit(tx);
      setDisableCommit(true);
      await tx2.wait();
      setMessage(
        'Commitment Successful. Please wait 60 seconds for registration.'
      );

      setTimeout(() => {
        setShowRegister(true);
        setDisableRegister(false);
        setShowCommit(false);
        setMessage('Register now...');
      }, 62000);
    } catch (error) {
      setErrors({
        domainName: 'Error while committing. Please try again',
      });
      setShowRegister(false);
    }
  };

  const handleRegister = async (domainName) => {
    const node = ethers.utils.namehash(domainName + '.edx');
    const signer = provider.getSigner();
    const edxReg = new ethers.Contract(
      edxRegistrarControllerAddress,
      edxRegistrarControllerAbi.abi,
      signer
    );
    const resolver = new ethers.Contract(
      resolverAddress,
      PublicResolverAbi.abi,
      signer
    );
    const price = await edxReg.rentPrice(domainName, 31536000);
    const part = price.toString().split(',');
    const PRICE = part[0];

    try {
      const tx3 = await edxReg.register(
        domainName,
        walletAddress,
        31536000,
        ethers.utils.formatBytes32String(''),
        resolverAddress,
        [],
        true,
        0,
        { value: PRICE, gasLimit: 1000000, gasPrice: 1000000000 }
      );
      setMessage('Registration in progress...');
      setDisableRegister(true);
      await tx3.wait();

      const tx4 = await resolver['setAddr(bytes32,address)'](
        node,
        walletAddress.toLowerCase()
      );
      await tx4.wait();

      setMessage('Registration Successful.. !');
      setShowRegister(false);
      setShowCommit(true);
      setDisableCommit(false);
    } catch (error) {
      setMessage('Error occurred while registering.. Try again later');
    }
  };

  const formik = useFormik({
    initialValues: {
      domainName: '',
    },
    validationSchema: Yup.object().shape({
      domainName: Yup.string()
        .required('Domain name is required')
        .min(4, 'Domain name must be at least 4 characters')
        .matches(/^[^.]*$/, 'Domain name cannot contain dots')
        .trim(),
    }),
    onSubmit: async (values) => {
      const domainName = values?.domainName;
      if (showCommit) {
        handleCommit(domainName);
      } else if (showRegister) {
        handleRegister(domainName);
      }
    },
  });

  const {
    values,
    handleBlur,
    errors,
    handleSubmit,
    touched,
    setFieldValue,
    setErrors,
  } = formik;

  const handleDomainNameChange = (e) => {
    const inputValue = e.target.value.replace(/[^\w]/g, '');
    setFieldValue('domainName', inputValue);
  };

  useEffect(() => {
    fetchENSName();
  }, [walletAddress, showRegister]);

  return (
    <div className="container min-safe">
      <header id="header">
        <div className="header-main">
          <img
            src="https://edexa-general.s3.ap-south-1.amazonaws.com/logo.svg"
            alt="edeXa Logo"
          />
          <div className="wallet-button">
            <div className="connect-wallet">
              {isConnected && network && <button>{network}</button>}
              {isConnected ? (
                <button onClick={connectWallet}>
                  {ensName ? (
                    <p className="name">{ensName}</p>
                  ) : (
                    <p className="name">
                      {walletAddress.slice(0, 6)}..{walletAddress.slice(-4)}
                    </p>
                  )}
                </button>
              ) : (
                <button onClick={connectWallet}>Connect Wallet</button>
              )}
            </div>
          </div>
        </div>
      </header>
      <main>
        <div className="main-content">
          <div className="main-text">
            <h1>Your web3 username</h1>
            <div className="main-sub-title">
              <div className="main-sub-title-text">
                Your identity across web3, one name for all your crypto
                addresses, and your decentralised website.
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <TextField
                placeholder="Enter Domain Name"
                variant="outlined"
                fullWidth
                type="text"
                name="domainName"
                id="domainName"
                value={values?.domainName}
                onChange={handleDomainNameChange}
                onBlur={handleBlur}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">.edx</InputAdornment>
                  ),
                }}
              />
              {touched?.domainName && errors?.domainName && (
                <div className="invalid-text">{errors?.domainName}</div>
              )}
              {showCommit && (
                <div className="commit-button">
                  <button
                    type="submit"
                    disabled={disableCommit || !isConnected}
                  >
                    Claim
                  </button>
                </div>
              )}
              {showRegister && (
                <div className="commit-button">
                  <button type="submit" disabled={disableRegister}>
                    Register
                  </button>
                </div>
              )}
            </form>
            <span className="message-info">{message}</span>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
