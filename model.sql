-- MySQL dump 10.13  Distrib 5.5.22, for Linux (x86_64)
--
-- Host: localhost    Database: mydb
-- ------------------------------------------------------
-- Server version	5.5.22

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `fahrer`
--

DROP TABLE IF EXISTS `fahrer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `fahrer` (
  `veranstaltung` int(11) DEFAULT NULL,
  `startnummer` int(11) DEFAULT NULL,
  `klasse` int(11) DEFAULT NULL,
  `nachname` varchar(30) DEFAULT NULL,
  `vorname` varchar(30) DEFAULT NULL,
  `strasse` varchar(30) DEFAULT NULL,
  `wohnort` varchar(40) DEFAULT NULL,
  `plz` varchar(5) DEFAULT NULL,
  `club` varchar(40) DEFAULT NULL,
  `fahrzeug` varchar(30) DEFAULT NULL,
  `geburtsdatum` date DEFAULT NULL,
  `telefon` varchar(20) DEFAULT NULL,
  `lizenznummer` varchar(20) DEFAULT NULL,
  `rahmennummer` varchar(20) DEFAULT NULL,
  `kennzeichen` varchar(15) DEFAULT NULL,
  `hubraum` varchar(10) DEFAULT NULL,
  `bemerkung` varchar(150) DEFAULT NULL,
  `land` varchar(33) DEFAULT NULL,
  `startzeit` time DEFAULT NULL,
  `zielzeit` time DEFAULT NULL,
  `stechen` int(11) DEFAULT NULL,
  `nennungseingang` tinyint(1) DEFAULT NULL,
  `papierabnahme` tinyint(1) DEFAULT NULL,
  `runden` int(11) DEFAULT NULL,
  `s0` int(11) DEFAULT NULL,
  `s1` int(11) DEFAULT NULL,
  `s2` int(11) DEFAULT NULL,
  `s3` int(11) DEFAULT NULL,
  `ausfall` int(11) DEFAULT NULL,
  `punkte` int(11) DEFAULT NULL,
  `wertungspunkte` int(11) DEFAULT NULL,
  `rang` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `klasse`
--

DROP TABLE IF EXISTS `klasse`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `klasse` (
  `veranstaltung` int(11) NOT NULL,
  `nummer` int(11) NOT NULL,
  `bezeichnung` varchar(60) DEFAULT NULL,
  `jahreswertung` tinyint(1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `punkte`
--

DROP TABLE IF EXISTS `punkte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `punkte` (
  `veranstaltung` int(11) NOT NULL,
  `startnummer` int(11) NOT NULL,
  `sektion` int(11) NOT NULL,
  `runde` int(11) NOT NULL,
  `punkte` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `runde`
--

DROP TABLE IF EXISTS `runde`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `runde` (
  `veranstaltung` int(11) NOT NULL,
  `startnummer` int(11) NOT NULL,
  `runde` int(11) NOT NULL,
  `punkte` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sektion`
--

DROP TABLE IF EXISTS `sektion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sektion` (
  `veranstaltung` int(11) NOT NULL,
  `klasse` int(11) NOT NULL,
  `sektion` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `veranstaltung`
--

DROP TABLE IF EXISTS `veranstaltung`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `veranstaltung` (
  `id` int(11) NOT NULL,
  `dateiname` varchar(128) NOT NULL,
  `dat_mtime` datetime DEFAULT NULL,
  `cfg_mtime` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wertung`
--

DROP TABLE IF EXISTS `wertung`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `wertung` (
  `veranstaltung` int(11) DEFAULT NULL,
  `nummer` int(11) DEFAULT NULL,
  `titel` varchar(70) DEFAULT NULL,
  `subtitel` varchar(70) DEFAULT NULL,
  `bezeichnung` varchar(20) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `wertungspunkte`
--

DROP TABLE IF EXISTS `wertungspunkte`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `wertungspunkte` (
  `veranstaltung` int(11) NOT NULL,
  `rang` int(11) NOT NULL,
  `punkte` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2012-04-29  1:01:25
