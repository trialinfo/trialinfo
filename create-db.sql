-- MySQL dump 10.16  Distrib 10.1.26-MariaDB, for Linux (x86_64)
--
-- Host: trialinfo    Database: trialinfo
-- ------------------------------------------------------
-- Server version	10.1.26-MariaDB

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
-- Table structure for table `admins_groups`
--

DROP TABLE IF EXISTS `admins_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admins_groups` (
  `user` int(11) NOT NULL,
  `group` int(11) NOT NULL,
  PRIMARY KEY (`user`,`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `card_colors`
--

DROP TABLE IF EXISTS `card_colors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `card_colors` (
  `id` int(11) NOT NULL DEFAULT '0',
  `round` int(11) NOT NULL,
  `color` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`,`round`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `classes` (
  `id` int(11) NOT NULL DEFAULT '0',
  `class` int(11) NOT NULL,
  `rounds` int(11) DEFAULT NULL,
  `name` varchar(60) DEFAULT NULL,
  `color` varchar(20) DEFAULT NULL,
  `riding_time` time DEFAULT NULL,
  `ranking_class` int(11) NOT NULL,
  `no_ranking1` tinyint(1) DEFAULT NULL,
  `non_competing` tinyint(1) DEFAULT NULL,
  `order` int(11) NOT NULL,
  PRIMARY KEY (`id`,`class`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `event_features`
--

DROP TABLE IF EXISTS `event_features`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `event_features` (
  `id` int(11) NOT NULL DEFAULT '0',
  `feature` varchar(30) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`,`feature`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events` (
  `tag` char(16) NOT NULL,
  `version` int(11) NOT NULL DEFAULT '1',
  `id` int(11) NOT NULL DEFAULT '0',
  `base` char(16) DEFAULT NULL,
  `base_fid` int(11) DEFAULT NULL,
  `title` varchar(70) DEFAULT NULL,
  `subtitle` varchar(70) DEFAULT NULL,
  `location` varchar(40) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `mtime` timestamp NULL DEFAULT NULL,
  `type` varchar(20) DEFAULT NULL,
  `enabled` tinyint(1) DEFAULT NULL,
  `uci_x10` tinyint(1) DEFAULT NULL,
  `four_marks` tinyint(1) DEFAULT NULL,
  `equal_marks_resolution` int(11) DEFAULT NULL,
  `split_score` tinyint(1) DEFAULT NULL,
  `marks_skipped_zone` int(11) DEFAULT NULL,
  `insurance` int(11) DEFAULT NULL,
  `registration_ends` timestamp NULL DEFAULT NULL,
  `registration_email` varchar(60) DEFAULT NULL,
  `registration_info` varchar(2048) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `start_interval` int(11) DEFAULT NULL,
  `start_spec` varchar(40) DEFAULT NULL,
  `main_ranking` int(11) DEFAULT NULL,
  `combine` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events_admins`
--

DROP TABLE IF EXISTS `events_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events_admins` (
  `id` int(11) NOT NULL DEFAULT '0',
  `user` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`,`user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events_admins_inherit`
--

DROP TABLE IF EXISTS `events_admins_inherit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events_admins_inherit` (
  `id` int(11) NOT NULL,
  `user` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`,`user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary table structure for view `events_all_admins`
--

DROP TABLE IF EXISTS `events_all_admins`;
/*!50001 DROP VIEW IF EXISTS `events_all_admins`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE TABLE `events_all_admins` (
  `id` tinyint NOT NULL,
  `email` tinyint NOT NULL,
  `password` tinyint NOT NULL,
  `read_only` tinyint NOT NULL
) ENGINE=MyISAM */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `events_groups`
--

DROP TABLE IF EXISTS `events_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events_groups` (
  `id` int(11) NOT NULL DEFAULT '0',
  `group` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`,`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `events_groups_inherit`
--

DROP TABLE IF EXISTS `events_groups_inherit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `events_groups_inherit` (
  `id` int(11) NOT NULL,
  `group` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`,`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `future_events`
--

DROP TABLE IF EXISTS `future_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `future_events` (
  `id` int(11) NOT NULL,
  `fid` int(11) NOT NULL,
  `date` date DEFAULT NULL,
  `location` varchar(40) DEFAULT NULL,
  `type` varchar(20) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`,`fid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `future_starts`
--

DROP TABLE IF EXISTS `future_starts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `future_starts` (
  `id` int(11) NOT NULL,
  `fid` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  PRIMARY KEY (`id`,`fid`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `groups`
--

DROP TABLE IF EXISTS `groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `groups` (
  `group` int(11) NOT NULL,
  `name` varchar(30) DEFAULT NULL,
  PRIMARY KEY (`group`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mailman_emails`
--

DROP TABLE IF EXISTS `mailman_emails`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mailman_emails` (
  `listname` varchar(20) NOT NULL,
  `email` varchar(60) NOT NULL,
  PRIMARY KEY (`listname`,`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `mailman_series`
--

DROP TABLE IF EXISTS `mailman_series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `mailman_series` (
  `listname` varchar(20) NOT NULL,
  `serie` int(11) NOT NULL,
  `id` int(11) DEFAULT NULL,
  `mtime` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`listname`,`serie`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `marks`
--

DROP TABLE IF EXISTS `marks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `marks` (
  `id` int(11) NOT NULL DEFAULT '0',
  `number` int(11) NOT NULL,
  `round` int(11) NOT NULL,
  `zone` int(11) NOT NULL,
  `marks` int(11) NOT NULL,
  PRIMARY KEY (`id`,`number`,`round`,`zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `new_numbers`
--

DROP TABLE IF EXISTS `new_numbers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `new_numbers` (
  `serie` int(11) NOT NULL,
  `id` int(11) NOT NULL DEFAULT '0',
  `number` int(11) NOT NULL,
  `new_number` int(11) DEFAULT NULL,
  PRIMARY KEY (`serie`,`id`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rankings`
--

DROP TABLE IF EXISTS `rankings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rankings` (
  `id` int(11) NOT NULL DEFAULT '0',
  `ranking` int(11) NOT NULL,
  `name` varchar(20) DEFAULT NULL,
  `default` tinyint(1) NOT NULL DEFAULT 0,
  `assign_scores` tinyint(1) NOT NULL DEFAULT 0,
  `joint` tinyint(1) NOT NULL DEFAULT 0,
  `split` tinyint(1) NOT NULL DEFAULT 0,
  `ignore` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`,`ranking`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `result_columns`
--

DROP TABLE IF EXISTS `result_columns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `result_columns` (
  `id` int(11) NOT NULL DEFAULT '0',
  `n` int(11) NOT NULL DEFAULT '0',
  `name` varchar(20) NOT NULL,
  PRIMARY KEY (`id`,`n`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rider_rankings`
--

DROP TABLE IF EXISTS `rider_rankings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rider_rankings` (
  `id` int(11) NOT NULL DEFAULT '0',
  `number` int(11) NOT NULL,
  `ranking` int(11) NOT NULL,
  `rank` int(11) DEFAULT NULL,
  `score` double DEFAULT NULL,
  `decisive_marks` INT DEFAULT NULL,
  `decisive_round` INT DEFAULT NULL,
  PRIMARY KEY (`id`,`number`,`ranking`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `riders`
--

DROP TABLE IF EXISTS `riders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `riders` (
  `version` int(11) NOT NULL DEFAULT '1',
  `id` int(11) NOT NULL DEFAULT '0',
  `number` int(11) NOT NULL,
  `group` tinyint(1) DEFAULT NULL,
  `class` int(11) DEFAULT NULL,
  `minder` int(11) DEFAULT NULL,
  `applicant` varchar(40) DEFAULT NULL,
  `entry_fee` varchar(10) DEFAULT NULL,
  `last_name` varchar(30) DEFAULT NULL,
  `first_name` varchar(30) DEFAULT NULL,
  `guardian` varchar(50) DEFAULT NULL,
  `street` varchar(30) DEFAULT NULL,
  `city` varchar(40) DEFAULT NULL,
  `zip` varchar(5) DEFAULT NULL,
  `club` varchar(40) DEFAULT NULL,
  `vehicle` varchar(30) DEFAULT NULL,
  `year_of_manufacture` int(11) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `emergency_phone` varchar(20) DEFAULT NULL,
  `license` varchar(20) DEFAULT NULL,
  `frame_number` varchar(20) DEFAULT NULL,
  `registration` varchar(15) DEFAULT NULL,
  `displacement` varchar(10) DEFAULT NULL,
  `email` varchar(60) DEFAULT NULL,
  `achievements` varchar(80) DEFAULT NULL,
  `comment` varchar(150) DEFAULT NULL,
  `rider_comment` varchar(150) DEFAULT NULL,
  `country` varchar(15) DEFAULT NULL,
  `province` varchar(20) DEFAULT NULL,
  `minding` varchar(8) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `finish_time` time DEFAULT NULL,
  `tie_break` int(11) DEFAULT '0',
  `registered` tinyint(1) DEFAULT NULL,
  `start` tinyint(1) DEFAULT NULL,
  `insurance` int(11) DEFAULT NULL,
  `rounds` int(11) DEFAULT NULL,
  `s0` int(11) DEFAULT NULL,
  `s1` int(11) DEFAULT NULL,
  `s2` int(11) DEFAULT NULL,
  `s3` int(11) DEFAULT NULL,
  `s4` int(11) DEFAULT NULL,
  `s5` int(11) DEFAULT NULL,
  `s6` int(11) DEFAULT NULL,
  `non_competing` tinyint(1) DEFAULT NULL,
  `failure` int(11) DEFAULT '0',
  `penalty_marks` float DEFAULT NULL,
  `additional_marks` float DEFAULT NULL,
  `marks` float DEFAULT NULL,
  `rank` int(11) DEFAULT NULL,
  `rider_tag` char(16) DEFAULT NULL,
  `user_tag` char(16) DEFAULT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT '1',
  `accept_conditions` tinyint(1) NOT NULL DEFAULT '0',
  `decisive_marks` INT DEFAULT NULL,
  `decisive_round` INT DEFAULT NULL,
  `unfinished_zones` INT DEFAULT NULL,
  PRIMARY KEY (`id`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `riders_groups`
--

DROP TABLE IF EXISTS `riders_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `riders_groups` (
  `id` int(11) NOT NULL DEFAULT '0',
  `group_number` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  PRIMARY KEY (`id`,`group_number`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `rounds`
--

DROP TABLE IF EXISTS `rounds`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `rounds` (
  `id` int(11) NOT NULL DEFAULT '0',
  `number` int(11) NOT NULL,
  `round` int(11) NOT NULL,
  `marks` int(11) NOT NULL,
  PRIMARY KEY (`id`,`number`,`round`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `scores`
--

DROP TABLE IF EXISTS `scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `scores` (
  `id` int(11) NOT NULL DEFAULT '0',
  `rank` int(11) NOT NULL,
  `score` int(11) NOT NULL,
  PRIMARY KEY (`id`,`rank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series`
--

DROP TABLE IF EXISTS `series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series` (
  `tag` char(16) NOT NULL,
  `version` int(11) NOT NULL DEFAULT '1',
  `serie` int(11) NOT NULL,
  `name` varchar(40) DEFAULT NULL,
  `abbreviation` varchar(10) DEFAULT NULL,
  `closed` tinyint(1) DEFAULT NULL,
  `mtime` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`serie`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_admins`
--

DROP TABLE IF EXISTS `series_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_admins` (
  `serie` int(11) NOT NULL,
  `user` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`serie`,`user`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary table structure for view `series_all_admins`
--

DROP TABLE IF EXISTS `series_all_admins`;
/*!50001 DROP VIEW IF EXISTS `series_all_admins`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8;
/*!50001 CREATE TABLE `series_all_admins` (
  `serie` tinyint NOT NULL,
  `email` tinyint NOT NULL,
  `password` tinyint NOT NULL,
  `read_only` tinyint NOT NULL
) ENGINE=MyISAM */;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `series_classes`
--

DROP TABLE IF EXISTS `series_classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_classes` (
  `serie` int(11) NOT NULL,
  `ranking` int(11) NOT NULL,
  `ranking_class` int(11) NOT NULL,
  `max_events` int(11) DEFAULT NULL,
  `min_events` int(11) DEFAULT NULL,
  `drop_events` int(11) DEFAULT NULL,
  PRIMARY KEY (`serie`,`ranking`,`ranking_class`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_events`
--

DROP TABLE IF EXISTS `series_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_events` (
  `serie` int(11) NOT NULL,
  `id` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`serie`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_groups`
--

DROP TABLE IF EXISTS `series_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_groups` (
  `serie` int(11) NOT NULL,
  `group` int(11) NOT NULL,
  `read_only` tinyint(1) NOT NULL,
  PRIMARY KEY (`serie`,`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_scores`
--

DROP TABLE IF EXISTS `series_scores`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_scores` (
  `serie` int(11) NOT NULL,
  `ranking` int(11) NOT NULL,
  `ranking_class` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  `last_id` int(11) NOT NULL,
  `rank` int(11) DEFAULT NULL,
  `drop_score` double DEFAULT NULL,
  `score` double DEFAULT NULL,
  `ranked` tinyint(1) NOT NULL,
  PRIMARY KEY (`serie`,`ranking`,`ranking_class`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `series_tie_break`
--

DROP TABLE IF EXISTS `series_tie_break`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `series_tie_break` (
  `serie` int(11) NOT NULL,
  `number` int(11) NOT NULL,
  `tie_break` int(11) NOT NULL DEFAULT '0',
  PRIMARY KEY (`serie`,`number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `skipped_zones`
--

DROP TABLE IF EXISTS `skipped_zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `skipped_zones` (
  `id` int(11) NOT NULL DEFAULT '0',
  `class` int(11) NOT NULL,
  `round` int(11) NOT NULL,
  `zone` int(11) NOT NULL,
  PRIMARY KEY (`id`,`class`,`round`,`zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user` int(11) NOT NULL,
  `email` varchar(60) NOT NULL,
  `password` varchar(40) DEFAULT NULL,
  `user_tag` char(16) NOT NULL,
  `secret` char(16) DEFAULT NULL,
  `secret_expires` timestamp NULL DEFAULT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT '0',
  `admin` tinyint(1) NOT NULL DEFAULT '0',
  `super_admin` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`user`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `user_tag` (`user_tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `zones`
--

DROP TABLE IF EXISTS `zones`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `zones` (
  `id` int(11) NOT NULL DEFAULT '0',
  `class` int(11) NOT NULL,
  `zone` int(11) NOT NULL,
  PRIMARY KEY (`id`,`class`,`zone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Final view structure for view `events_all_admins`
--

/*!50001 DROP TABLE IF EXISTS `events_all_admins`*/;
/*!50001 DROP VIEW IF EXISTS `events_all_admins`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8 */;
/*!50001 SET character_set_results     = utf8 */;
/*!50001 SET collation_connection      = utf8_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `events_all_admins` AS select distinct `events`.`id` AS `id`,`users`.`email` AS `email`,`users`.`password` AS `password`,0 AS `read_only` from (`events` join `users`) where ((`users`.`password` is not null) and (`users`.`admin` <> 0) and (`users`.`super_admin` <> 0)) union select `events_admins`.`id` AS `id`,`users`.`email` AS `email`,`users`.`password` AS `password`,`events_admins`.`read_only` AS `read_only` from (`events_admins` join `users` on((`events_admins`.`user` = `users`.`user`))) where ((`users`.`password` is not null) and (`users`.`admin` <> 0)) union select `events_groups`.`id` AS `id`,`users`.`email` AS `email`,`users`.`password` AS `password`,`events_groups`.`read_only` AS `read_only` from (((`events_groups` join `groups` on((`events_groups`.`group` = `groups`.`group`))) join `admins_groups` on((`events_groups`.`group` = `admins_groups`.`group`))) join `users` on((`admins_groups`.`user` = `users`.`user`))) where ((`users`.`password` is not null) and (`users`.`admin` <> 0)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `series_all_admins`
--

/*!50001 DROP TABLE IF EXISTS `series_all_admins`*/;
/*!50001 DROP VIEW IF EXISTS `series_all_admins`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8 */;
/*!50001 SET character_set_results     = utf8 */;
/*!50001 SET collation_connection      = utf8_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50001 VIEW `series_all_admins` AS select distinct `series`.`serie` AS `serie`,`users`.`email` AS `email`,`users`.`password` AS `password`,0 AS `read_only` from (`series` join `users`) where ((`users`.`password` is not null) and (`users`.`admin` <> 0) and (`users`.`super_admin` <> 0)) union select `series_admins`.`serie` AS `serie`,`users`.`email` AS `email`,`users`.`password` AS `password`,`series_admins`.`read_only` AS `read_only` from (`series_admins` join `users` on((`series_admins`.`user` = `users`.`user`))) where ((`users`.`password` is not null) and (`users`.`admin` <> 0)) union select `series_groups`.`serie` AS `serie`,`users`.`email` AS `email`,`users`.`password` AS `password`,`series_groups`.`read_only` AS `read_only` from (((`series_groups` join `groups` on((`series_groups`.`group` = `groups`.`group`))) join `admins_groups` on((`series_groups`.`group` = `admins_groups`.`group`))) join `users` on((`admins_groups`.`user` = `users`.`user`))) where ((`users`.`password` is not null) and (`users`.`admin` <> 0)) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2017-10-28 22:07:04
